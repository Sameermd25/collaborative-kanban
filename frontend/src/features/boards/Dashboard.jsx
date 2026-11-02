
import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { logout, setActiveTenant } from "../auth/authSlice";

import {
    createBoard,
    createTask,
    updateTask,
    deleteTask,
    fetchBoards,
    fetchBoardDetails,
    fetchMembers,
    moveTask,
    resetWorkspace,
    undoTaskChange,
    redoTaskChange,
    selectCanUndo,
    selectCanRedo,
} from "./boardSlice";

import ThemeToggle from "../theme/ThemeToggle";
import ActivityPanel from "../activity/ActivityPanel";
import { createSocketConnection } from "../../services/socket";

export default function Dashboard() {
    const dispatch = useDispatch();

    const {
        user,
        activeTenantId,
        memberships = [],
    } = useSelector((state) => state.auth);

    const { mode } = useSelector((state) => state.theme);

    const {
        boards,
        activeBoard,
        columns,
        tasks,
        members,
        loading,
        error,
        mutationLoading,
    } = useSelector((state) => state.boards);

    const canUndo = useSelector(selectCanUndo);
    const canRedo = useSelector(selectCanRedo);

    const activeBoardRef = useRef(activeBoard);

    useEffect(() => {
        activeBoardRef.current = activeBoard;
    }, [activeBoard]);

    const [activeView, setActiveView] = useState("dashboard");
    const [showBoardForm, setShowBoardForm] = useState(false);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState(null);
    const [selectedTask, setSelectedTask] = useState(null);

    const [boardForm, setBoardForm] = useState({
        name: "",
        description: "",
    });

    const [taskForm, setTaskForm] = useState({
        title: "",
        description: "",
        priority: "medium",
        columnId: "",
        assigneeId: "",
    });

    const [onlineUsers, setOnlineUsers] = useState([]);
    const [socketStatus, setSocketStatus] = useState("connecting");
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [dragOverColumnId, setDragOverColumnId] = useState(null);
    const [selectedOrganizationId, setSelectedOrganizationId] = useState("");

    const getId = (value) =>
        typeof value === "object" ? value?._id : value;

    // --------------------------------------------------
    // ORGANIZATIONS AND TENANTS
    // --------------------------------------------------

    const organizations = useMemo(() => {
        const uniqueOrganizations = new Map();

        memberships.forEach((membership) => {
            const organization = membership.organizationId;

            if (organization && typeof organization === "object") {
                uniqueOrganizations.set(
                    getId(organization),
                    organization
                );
            }
        });

        return Array.from(uniqueOrganizations.values());
    }, [memberships]);

    const activeMembership = memberships.find(
        (membership) =>
            String(getId(membership.tenantId)) ===
            String(activeTenantId)
    );

    const currentOrganizationId = activeMembership
        ? getId(activeMembership.organizationId)
        : selectedOrganizationId;

    const availableTenants = memberships.filter(
        (membership) =>
            String(getId(membership.organizationId)) ===
                String(currentOrganizationId) &&
            membership.isActive
    );

    useEffect(() => {
        if (currentOrganizationId) {
            setSelectedOrganizationId(currentOrganizationId);
        } else if (organizations.length > 0) {
            setSelectedOrganizationId(getId(organizations[0]));
        }
    }, [currentOrganizationId, organizations]);

    const handleOrganizationChange = (organizationId) => {
        setSelectedOrganizationId(organizationId);

        const firstTenant = memberships.find(
            (membership) =>
                String(getId(membership.organizationId)) ===
                    String(organizationId) &&
                membership.isActive
        );

        if (firstTenant) {
            dispatch(setActiveTenant(getId(firstTenant.tenantId)));
        }
    };

    const handleTenantChange = (tenantId) => {
        dispatch(setActiveTenant(tenantId));
    };

    // --------------------------------------------------
    // THEME
    // --------------------------------------------------

    useEffect(() => {
        document.documentElement.dataset.theme = mode;
    }, [mode]);

    // --------------------------------------------------
    // INITIAL WORKSPACE DATA
    // --------------------------------------------------

    useEffect(() => {
        if (!activeTenantId) return;

        dispatch(resetWorkspace());
        dispatch(fetchBoards());
        dispatch(fetchMembers());

        setSelectedTask(null);
        setEditingTask(null);
        setShowTaskForm(false);
    }, [dispatch, activeTenantId]);

    useEffect(() => {
        if (boards.length > 0 && !activeBoard) {
            dispatch(fetchBoardDetails(boards[0]._id));
        }
    }, [boards, activeBoard, dispatch]);

    // --------------------------------------------------
    // TASK FORM DEFAULT COLUMN
    // --------------------------------------------------

    useEffect(() => {
        if (showTaskForm && columns.length > 0) {
            setTaskForm((previous) => ({
                ...previous,
                columnId: columns.some(
                    (column) =>
                        String(column._id) ===
                        String(previous.columnId)
                )
                    ? previous.columnId
                    : columns[0]._id,
            }));
        }
    }, [showTaskForm, columns]);

    // --------------------------------------------------
    // SOCKET.IO
    // --------------------------------------------------

    useEffect(() => {
        const token = localStorage.getItem("token");
        const tenantId = activeTenantId;

        if (!token || !tenantId) {
            setSocketStatus("disconnected");
            setOnlineUsers([]);
            return;
        }

        const socket = createSocketConnection(token);

        const refreshBoard = (payload) => {
            const currentBoardId = activeBoardRef.current?._id;

            if (
                !currentBoardId ||
                String(payload?.boardId) !== String(currentBoardId)
            ) {
                return;
            }

            dispatch(fetchBoardDetails(currentBoardId));
        };

        socket.on("connect", () => {
            setSocketStatus("connected");

            socket.emit("tenant:join", { tenantId }, (response) => {
                if (response?.success) {
                    setOnlineUsers(response.onlineUsers || []);
                } else {
                    console.error(
                        "Tenant join failed:",
                        response?.message
                    );
                }
            });
        });

        socket.on("presence:update", (users) => {
            setOnlineUsers(users || []);
        });

        socket.on("task:created", refreshBoard);
        socket.on("task:updated", refreshBoard);
        socket.on("task:deleted", refreshBoard);
        socket.on("task:moved", refreshBoard);

        socket.on("connect_error", (socketError) => {
            console.error("Socket error:", socketError.message);
            setSocketStatus("disconnected");
        });

        socket.on("disconnect", () => {
            setSocketStatus("disconnected");
            setOnlineUsers([]);
        });

        return () => {
            socket.emit("tenant:leave", { tenantId });
            socket.disconnect();
        };
    }, [dispatch, activeTenantId]);

    // --------------------------------------------------
    // UNDO / REDO
    // --------------------------------------------------

    async function handleUndo() {
        if (!canUndo || mutationLoading) return;

        const result = await dispatch(undoTaskChange());

        if (undoTaskChange.rejected.match(result)) {
            console.error("Undo failed:", result.payload);
        }
    }

    async function handleRedo() {
        if (!canRedo || mutationLoading) return;

        const result = await dispatch(redoTaskChange());

        if (redoTaskChange.rejected.match(result)) {
            console.error("Redo failed:", result.payload);
        }
    }

    // --------------------------------------------------
    // TASK STATISTICS
    // --------------------------------------------------

    const completedCount = useMemo(() => {
        return tasks.filter((task) => {
            const columnId =
                task.columnId?._id || task.columnId;

            const column = columns.find(
                (col) =>
                    String(col._id) === String(columnId)
            );

            return column?.name?.toLowerCase().includes("done");
        }).length;
    }, [tasks, columns]);

    const inProgressCount = useMemo(() => {
        return tasks.filter((task) => {
            const columnId =
                task.columnId?._id || task.columnId;

            const column = columns.find(
                (col) =>
                    String(col._id) === String(columnId)
            );

            return column?.name?.toLowerCase().includes("progress");
        }).length;
    }, [tasks, columns]);

    const tasksInColumn = (columnId) => {
        return tasks.filter(
            (task) =>
                String(task.columnId?._id || task.columnId) ===
                String(columnId)
        );
    };

    // --------------------------------------------------
    // MY TASKS
    // --------------------------------------------------

    const myTasks = useMemo(() => {
        const currentUserId = String(
            user?._id || user?.id || ""
        );

        if (!currentUserId) return [];

        return tasks.filter((task) => {
            const assigneeId =
                task.assigneeId?._id ||
                task.assigneeId?.id ||
                task.assigneeId;

            return String(assigneeId || "") === currentUserId;
        });
    }, [tasks, user]);

    // --------------------------------------------------
    // CREATE BOARD
    // --------------------------------------------------

    async function handleCreateBoard(event) {
        event.preventDefault();

        const result = await dispatch(createBoard(boardForm));

        if (createBoard.fulfilled.match(result)) {
            setShowBoardForm(false);

            setBoardForm({
                name: "",
                description: "",
            });

            await dispatch(fetchBoards());

            if (result.payload?._id) {
                dispatch(fetchBoardDetails(result.payload._id));
            }
        }
    }

    // --------------------------------------------------
    // CREATE TASK
    // --------------------------------------------------

    async function handleCreateTask(event) {
        event.preventDefault();

        if (!activeBoard || !taskForm.columnId) return;

        const result = await dispatch(
            createTask({
                boardId: activeBoard._id,
                columnId: taskForm.columnId,
                title: taskForm.title,
                description: taskForm.description,
                priority: taskForm.priority,
                assigneeId: taskForm.assigneeId || null,
            })
        );

        if (createTask.fulfilled.match(result)) {
            setShowTaskForm(false);

            setTaskForm({
                title: "",
                description: "",
                priority: "medium",
                columnId: "",
                assigneeId: "",
            });

            // The createTask fulfilled reducer adds the task.
            // Refreshing is not needed here.
        }
    }

    // --------------------------------------------------
    // UPDATE TASK
    // --------------------------------------------------

    async function handleUpdateTask(event) {
        event.preventDefault();

        if (!editingTask) return;

        const result = await dispatch(
            updateTask({
                taskId: editingTask._id,
                version: editingTask.version,
                title: taskForm.title,
                description: taskForm.description,
                priority: taskForm.priority,
                assigneeId: taskForm.assigneeId || null,
            })
        );

        if (updateTask.fulfilled.match(result)) {
            setEditingTask(null);
            setShowTaskForm(false);
            setSelectedTask(null);

            setTaskForm({
                title: "",
                description: "",
                priority: "medium",
                columnId: "",
                assigneeId: "",
            });

            // updateTask.fulfilled updates Redux state.
            // Do not fetch board details here, as that can clear history.
        }
    }

    // --------------------------------------------------
    // DELETE TASK
    // --------------------------------------------------

    async function handleDeleteTask(task) {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${task.title}"?`
        );

        if (!confirmed) return;

        const result = await dispatch(deleteTask(task._id));

        if (deleteTask.fulfilled.match(result)) {
            setSelectedTask(null);

            // deleteTask.fulfilled removes the task from Redux state.
        }
    }

    // --------------------------------------------------
    // MOVE TASK
    // --------------------------------------------------

    async function handleMove(task, targetColumnId) {
        const currentColumnId =
            task.columnId?._id || task.columnId;

        if (
            String(currentColumnId) ===
            String(targetColumnId)
        ) {
            return;
        }

        const result = await dispatch(
            moveTask({
                taskId: task._id,
                targetColumnId,
                version: task.version,
            })
        );

        if (moveTask.fulfilled.match(result)) {
            // moveTask.fulfilled updates Redux state.
            // Do not fetch board details here, as that can clear history.
        }
    }

    // --------------------------------------------------
    // DRAG AND DROP
    // --------------------------------------------------

    function handleDragStart(event, task) {
        setDraggedTaskId(task._id);

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task._id);
    }

    function handleDragOver(event, columnId) {
        event.preventDefault();

        event.dataTransfer.dropEffect = "move";
        setDragOverColumnId(columnId);
    }

    async function handleDrop(event, columnId) {
        event.preventDefault();

        const taskId = event.dataTransfer.getData("text/plain");

        const task = tasks.find(
            (item) =>
                String(item._id) ===
                String(taskId || draggedTaskId)
        );

        setDraggedTaskId(null);
        setDragOverColumnId(null);

        if (!task) return;

        await handleMove(task, columnId);
    }

    function handleDragEnd() {
        setDraggedTaskId(null);
        setDragOverColumnId(null);
    }

    // --------------------------------------------------
    // TASK MODALS
    // --------------------------------------------------

    function openTaskModal() {
        setEditingTask(null);

        setTaskForm({
            title: "",
            description: "",
            priority: "medium",
            columnId: columns[0]?._id || "",
            assigneeId: "",
        });

        setShowTaskForm(true);
    }

    function openEditTask(task) {
        setSelectedTask(null);
        setEditingTask(task);

        setTaskForm({
            title: task.title || "",
            description: task.description || "",
            priority: (task.priority || "medium").toLowerCase(),
            columnId: String(
                task.columnId?._id || task.columnId || ""
            ),
            assigneeId:
                task.assigneeId?._id ||
                task.assigneeId ||
                "",
        });

        setShowTaskForm(true);
    }

    // --------------------------------------------------
    // TASK CARD
    // --------------------------------------------------

    function renderTaskCard(task) {
        const currentColumnId =
            task.columnId?._id || task.columnId;

        return (
            <article
                className={`task-card ${
                    draggedTaskId === task._id ? "dragging" : ""
                }`}
                key={task._id}
                draggable
                onClick={() => {
                    if (!draggedTaskId) {
                        setSelectedTask(task);
                    }
                }}
                onDragStart={(event) =>
                    handleDragStart(event, task)
                }
                onDragEnd={handleDragEnd}
            >
                <div className="task-card-top">
                    <span
                        className={`priority ${(
                            task.priority || "medium"
                        ).toLowerCase()}`}
                    >
                        {task.priority || "Medium"}
                    </span>
                </div>

                <div className="task-card-title">
                    <h4>{task.title}</h4>

                    <div className="task-card-actions">
                        <button
                            type="button"
                            className="edit-task-button"
                            onClick={(event) => {
                                event.stopPropagation();
                                openEditTask(task);
                            }}
                        >
                            Edit
                        </button>

                        <button
                            type="button"
                            className="delete-task-button"
                            onClick={(event) => {
                                event.stopPropagation();
                                handleDeleteTask(task);
                            }}
                        >
                            Delete
                        </button>
                    </div>
                </div>

                {task.description && (
                    <p>{task.description}</p>
                )}

                <div className="task-meta">
                    <span>
                        {task.assigneeId?.name || "Unassigned"}
                    </span>

                    <span>
                        {task.dueDate
                            ? new Date(
                                  task.dueDate
                              ).toLocaleDateString()
                            : ""}
                    </span>
                </div>

                <label
                    className="move-label"
                    onClick={(event) =>
                        event.stopPropagation()
                    }
                >
                    Move to

                    <select
                        value={String(currentColumnId || "")}
                        onClick={(event) =>
                            event.stopPropagation()
                        }
                        onChange={(event) =>
                            handleMove(task, event.target.value)
                        }
                    >
                        {columns.map((column) => (
                            <option
                                key={column._id}
                                value={column._id}
                            >
                                {column.name ||
                                    column.title ||
                                    "Untitled column"}
                            </option>
                        ))}
                    </select>
                </label>
            </article>
        );
    }

    // --------------------------------------------------
    // RENDER
    // --------------------------------------------------

    return (
        <div className="app-shell">
            {/* SIDEBAR */}

            <aside className="sidebar">
                <div className="brand">
                    <span className="brand-mark small">K</span>
                    <span>KanbanFlow</span>
                </div>

                <p className="sidebar-caption">WORKSPACE</p>

                <button
                    type="button"
                    className={`side-link ${
                        activeView === "dashboard" ? "selected" : ""
                    }`}
                    onClick={() => setActiveView("dashboard")}
                >
                    ▦ <span>Dashboard</span>
                </button>

                <button
                    type="button"
                    className={`side-link ${
                        activeView === "myTasks" ? "selected" : ""
                    }`}
                    onClick={() => setActiveView("myTasks")}
                >
                    ▤ <span>My Tasks</span>
                </button>

                <button
                    type="button"
                    className={`side-link ${
                        activeView === "activity" ? "selected" : ""
                    }`}
                    onClick={() => setActiveView("activity")}
                >
                    ◷ <span>Activity</span>
                </button>

                <div className="sidebar-spacer" />

                <button
                    className="side-action logout"
                    onClick={() => dispatch(logout())}
                >
                    ↪ Sign out
                </button>
            </aside>

            {/* MAIN AREA */}

            <main className="main-area">
                <header className="topbar">
                    <div>
                        <p className="breadcrumb">
                            Workspace /{" "}
                            {activeView === "dashboard"
                                ? "Boards"
                                : activeView === "myTasks"
                                ? "My Tasks"
                                : "Activity"}
                        </p>

                        <h2>
                            {activeView === "dashboard"
                                ? "Dashboard"
                                : activeView === "myTasks"
                                ? "My Tasks"
                                : "Activity"}
                        </h2>
                    </div>

                    <div className="topbar-right">
                        <ThemeToggle compact />
                        <div className="workspace-switchers">
                            <select
                                className="workspace-select"
                                value={selectedOrganizationId}
                                onChange={(event) =>
                                    handleOrganizationChange(
                                        event.target.value
                                    )
                                }
                                aria-label="Select organization"
                                disabled={organizations.length <= 1}
                            >
                                {organizations.map((organization) => (
                                    <option
                                        key={organization._id}
                                        value={organization._id}
                                    >
                                        {organization.name}
                                    </option>
                                ))}
                            </select>

                            <select
                                className="workspace-select"
                                value={activeTenantId || ""}
                                onChange={(event) =>
                                    handleTenantChange(
                                        event.target.value
                                    )
                                }
                                aria-label="Select workspace"
                                disabled={availableTenants.length <= 1}
                            >
                                {availableTenants.map((membership) => (
                                    <option
                                        key={getId(membership.tenantId)}
                                        value={getId(membership.tenantId)}
                                    >
                                        {membership.tenantId?.name ||
                                            "Workspace"}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="online-status">
                            <span
                                className={`status-dot ${
                                    socketStatus === "connected"
                                        ? "online"
                                        : "offline"
                                }`}
                            />

                            {socketStatus === "connected"
                                ? `${onlineUsers.length} online`
                                : "Connecting..."}
                        </div>

                        <div className="profile-chip">
                            <span className="avatar">
                                {(user?.name || user?.email || "S")
                                    .charAt(0)
                                    .toUpperCase()}
                            </span>

                            <span>
                                {user?.name || user?.email || "User"}
                            </span>
                        </div>
                    </div>
                </header>

                {error && (
                    <div className="alert error">{error}</div>
                )}

                {loading && (
                    <div className="loading-line">
                        Loading workspace...
                    </div>
                )}

                {!loading && (
                    <>
                        {/* DASHBOARD VIEW */}

                        {activeView === "dashboard" && (
                            <>
                                <section className="welcome-row">
                                    <div>
                                        <p className="eyebrow">
                                            YOUR WORKSPACE
                                        </p>

                                        <h1>
                                            Welcome back
                                            {user?.name
                                                ? `, ${user.name.split(" ")[0]}`
                                                : ""}
                                            !
                                        </h1>

                                        <p className="muted">
                                            Plan, track, and move your team's
                                            work forward.
                                        </p>
                                    </div>

                                    <div className="welcome-actions">
                                        <button
                                            className="secondary-button"
                                            onClick={() =>
                                                setShowBoardForm(true)
                                            }
                                        >
                                            ＋ New board
                                        </button>

                                        <button
                                            className="primary-button compact"
                                            disabled={
                                                !activeBoard ||
                                                columns.length === 0
                                            }
                                            onClick={openTaskModal}
                                        >
                                            ＋ Add task
                                        </button>
                                    </div>
                                </section>

                                <section className="stats-grid">
                                    <Stat
                                        label="Total tasks"
                                        value={tasks.length}
                                        note="Across this board"
                                    />

                                    <Stat
                                        label="Completed"
                                        value={completedCount}
                                        note="In completed columns"
                                    />

                                    <Stat
                                        label="In progress"
                                        value={inProgressCount}
                                        note="Currently being worked on"
                                    />

                                    <Stat
                                        label="Boards"
                                        value={boards.length}
                                        note="In this workspace"
                                    />
                                </section>

                                <section className="board-panel">
                                    <div className="board-toolbar">
                                        <div>
                                            <p className="eyebrow">
                                                PROJECT BOARD
                                            </p>

                                            <h2>
                                                {activeBoard?.name ||
                                                    "Your boards"}
                                            </h2>

                                            <p className="muted">
                                                {activeBoard?.description ||
                                                    "Select a board to view its tasks."}
                                            </p>
                                        </div>

                                        <div className="board-toolbar-actions">
                                            {/* UNDO / REDO BUTTONS */}

                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={handleUndo}
                                                disabled={
                                                    !canUndo ||
                                                    mutationLoading
                                                }
                                                title="Undo last task change"
                                            >
                                                ↶ Undo
                                            </button>

                                            <button
                                                type="button"
                                                className="secondary-button"
                                                onClick={handleRedo}
                                                disabled={
                                                    !canRedo ||
                                                    mutationLoading
                                                }
                                                title="Redo last undone task change"
                                            >
                                                ↷ Redo
                                            </button>

                                            {boards.length > 0 && (
                                                <select
                                                    className="board-select"
                                                    value={
                                                        activeBoard?._id || ""
                                                    }
                                                    onChange={(event) =>
                                                        dispatch(
                                                            fetchBoardDetails(
                                                                event.target.value
                                                            )
                                                        )
                                                    }
                                                >
                                                    {boards.map((board) => (
                                                        <option
                                                            key={board._id}
                                                            value={board._id}
                                                        >
                                                            {board.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    </div>

                                    {boards.length === 0 ? (
                                        <div className="empty-state">
                                            <h3>No boards yet</h3>

                                            <p>
                                                Create your first board to start
                                                organizing work.
                                            </p>

                                            <button
                                                className="primary-button compact"
                                                onClick={() =>
                                                    setShowBoardForm(true)
                                                }
                                            >
                                                Create board
                                            </button>
                                        </div>
                                    ) : columns.length === 0 ? (
                                        <div className="empty-state">
                                            <h3>No columns found</h3>

                                            <p>
                                                This board does not have any
                                                columns yet.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="kanban-grid">
                                            {columns.map((column) => (
                                                <section
                                                    className={`kanban-column ${
                                                        String(
                                                            dragOverColumnId
                                                        ) ===
                                                        String(column._id)
                                                            ? "drag-over"
                                                            : ""
                                                    }`}
                                                    key={column._id}
                                                    onDragOver={(event) =>
                                                        handleDragOver(
                                                            event,
                                                            column._id
                                                        )
                                                    }
                                                    onDrop={(event) =>
                                                        handleDrop(
                                                            event,
                                                            column._id
                                                        )
                                                    }
                                                    onDragLeave={(event) => {
                                                        if (
                                                            !event.currentTarget.contains(
                                                                event.relatedTarget
                                                            )
                                                        ) {
                                                            setDragOverColumnId(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <div className="column-head">
                                                        <div>
                                                            <span
                                                                className={`column-dot ${
                                                                    column.name
                                                                        ?.toLowerCase()
                                                                        .includes(
                                                                            "done"
                                                                        )
                                                                        ? "green"
                                                                        : column.name
                                                                                ?.toLowerCase()
                                                                                .includes(
                                                                                    "progress"
                                                                                )
                                                                        ? "orange"
                                                                        : "blue"
                                                                }`}
                                                            />

                                                            <h3>
                                                                {column.name ||
                                                                    column.title ||
                                                                    "Untitled column"}
                                                            </h3>
                                                        </div>

                                                        <span className="count-pill">
                                                            {
                                                                tasksInColumn(
                                                                    column._id
                                                                ).length
                                                            }
                                                        </span>
                                                    </div>

                                                    <div className="task-stack">
                                                        {tasksInColumn(
                                                            column._id
                                                        ).map(renderTaskCard)}

                                                        {tasksInColumn(
                                                            column._id
                                                        ).length === 0 && (
                                                            <div className="empty-column">
                                                                No tasks here yet
                                                            </div>
                                                        )}
                                                    </div>
                                                </section>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <ActivityPanel />
                            </>
                        )}

                        {/* MY TASKS VIEW */}

                        {activeView === "myTasks" && (
                            <section className="board-panel">
                                <div className="board-toolbar">
                                    <div>
                                        <p className="eyebrow">
                                            PERSONAL WORKSPACE
                                        </p>

                                        <h2>My Tasks</h2>

                                        <p className="muted">
                                            Tasks assigned to your account.
                                        </p>
                                    </div>

                                    <button
                                        className="primary-button compact"
                                        disabled={
                                            !activeBoard ||
                                            columns.length === 0
                                        }
                                        onClick={openTaskModal}
                                    >
                                        ＋ Add task
                                    </button>
                                </div>

                                {myTasks.length === 0 ? (
                                    <div className="empty-state">
                                        <h3>No tasks assigned to you</h3>

                                        <p>
                                            Tasks assigned to your account will
                                            appear here.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="kanban-grid">
                                        {columns.map((column) => {
                                            const columnTasks = myTasks.filter(
                                                (task) => {
                                                    const id =
                                                        task.columnId?._id ||
                                                        task.columnId;

                                                    return (
                                                        String(id) ===
                                                        String(column._id)
                                                    );
                                                }
                                            );

                                            return (
                                                <section
                                                    className={`kanban-column ${
                                                        String(
                                                            dragOverColumnId
                                                        ) ===
                                                        String(column._id)
                                                            ? "drag-over"
                                                            : ""
                                                    }`}
                                                    key={column._id}
                                                    onDragOver={(event) =>
                                                        handleDragOver(
                                                            event,
                                                            column._id
                                                        )
                                                    }
                                                    onDrop={(event) =>
                                                        handleDrop(
                                                            event,
                                                            column._id
                                                        )
                                                    }
                                                    onDragLeave={(event) => {
                                                        if (
                                                            !event.currentTarget.contains(
                                                                event.relatedTarget
                                                            )
                                                        ) {
                                                            setDragOverColumnId(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <div className="column-head">
                                                        <h3>
                                                            {column.name ||
                                                                column.title ||
                                                                "Untitled column"}
                                                        </h3>

                                                        <span className="count-pill">
                                                            {columnTasks.length}
                                                        </span>
                                                    </div>

                                                    <div className="task-stack">
                                                        {columnTasks.map(
                                                            renderTaskCard
                                                        )}

                                                        {columnTasks.length ===
                                                            0 && (
                                                            <div className="empty-column">
                                                                No assigned
                                                                tasks
                                                            </div>
                                                        )}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>
                        )}

                        {/* ACTIVITY VIEW */}

                        {activeView === "activity" && (
                            <section className="board-panel">
                                <div className="board-toolbar">
                                    <div>
                                        <p className="eyebrow">
                                            WORKSPACE UPDATES
                                        </p>

                                        <h2>Recent activity</h2>

                                        <p className="muted">
                                            Recent changes made in your
                                            workspace.
                                        </p>
                                    </div>
                                </div>

                                <ActivityPanel />
                            </section>
                        )}
                    </>
                )}
            </main>

            {/* CREATE BOARD MODAL */}

            {showBoardForm && (
                <Modal
                    title="Create a board"
                    onClose={() => setShowBoardForm(false)}
                >
                    <form onSubmit={handleCreateBoard}>
                        <label>Board name</label>

                        <input
                            value={boardForm.name}
                            onChange={(event) =>
                                setBoardForm({
                                    ...boardForm,
                                    name: event.target.value,
                                })
                            }
                            placeholder="e.g. Website redesign"
                            required
                        />

                        <label>Description</label>

                        <textarea
                            value={boardForm.description}
                            onChange={(event) =>
                                setBoardForm({
                                    ...boardForm,
                                    description: event.target.value,
                                })
                            }
                            placeholder="What is this board for?"
                        />

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => setShowBoardForm(false)}
                            >
                                Cancel
                            </button>

                            <button
                                className="primary-button compact"
                                disabled={mutationLoading}
                            >
                                {mutationLoading
                                    ? "Creating..."
                                    : "Create board"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* CREATE / EDIT TASK MODAL */}

            {showTaskForm && (
                <Modal
                    title={editingTask ? "Edit task" : "Add a task"}
                    onClose={() => {
                        setShowTaskForm(false);
                        setEditingTask(null);
                    }}
                >
                    <form
                        onSubmit={
                            editingTask
                                ? handleUpdateTask
                                : handleCreateTask
                        }
                    >
                        <label>Task title</label>

                        <input
                            value={taskForm.title}
                            onChange={(event) =>
                                setTaskForm({
                                    ...taskForm,
                                    title: event.target.value,
                                })
                            }
                            placeholder="What needs to be done?"
                            required
                        />

                        <label>Description</label>

                        <textarea
                            value={taskForm.description}
                            onChange={(event) =>
                                setTaskForm({
                                    ...taskForm,
                                    description: event.target.value,
                                })
                            }
                            placeholder="Add details (optional)"
                        />

                        {!editingTask && (
                            <>
                                <label>Column</label>

                                <select
                                    value={taskForm.columnId}
                                    onChange={(event) =>
                                        setTaskForm({
                                            ...taskForm,
                                            columnId: event.target.value,
                                        })
                                    }
                                    required
                                    disabled={columns.length === 0}
                                >
                                    {columns.length === 0 ? (
                                        <option value="">
                                            No columns available
                                        </option>
                                    ) : (
                                        <>
                                            <option value="" disabled>
                                                Select a column
                                            </option>

                                            {columns.map((column) => (
                                                <option
                                                    key={column._id}
                                                    value={column._id}
                                                >
                                                    {column.name ||
                                                        column.title ||
                                                        column.label ||
                                                        "Untitled column"}
                                                </option>
                                            ))}
                                        </>
                                    )}
                                </select>
                            </>
                        )}

                        <label>Priority</label>

                        <select
                            value={taskForm.priority}
                            onChange={(event) =>
                                setTaskForm({
                                    ...taskForm,
                                    priority: event.target.value,
                                })
                            }
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>

                        <label>Assignee</label>

                        <select
                            value={taskForm.assigneeId}
                            onChange={(event) =>
                                setTaskForm({
                                    ...taskForm,
                                    assigneeId: event.target.value,
                                })
                            }
                        >
                            <option value="">Unassigned</option>

                            {members.map((member) => (
                                <option
                                    key={member._id}
                                    value={member._id}
                                >
                                    {member.name} ({member.email})
                                </option>
                            ))}
                        </select>

                        <div className="modal-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => {
                                    setShowTaskForm(false);
                                    setEditingTask(null);
                                }}
                            >
                                Cancel
                            </button>

                            <button
                                className="primary-button compact"
                                disabled={
                                    mutationLoading ||
                                    (!editingTask && columns.length === 0)
                                }
                            >
                                {mutationLoading
                                    ? "Saving..."
                                    : editingTask
                                    ? "Update task"
                                    : "Add task"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* TASK DETAIL PANEL */}

            {selectedTask && (
                <div
                    className="modal-backdrop"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setSelectedTask(null);
                        }
                    }}
                >
                    <section
                        className="modal task-detail-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="task-detail-heading"
                    >
                        <div className="modal-head">
                            <h2 id="task-detail-heading">
                                Task Details
                            </h2>

                            <button
                                type="button"
                                className="icon-button"
                                onClick={() => setSelectedTask(null)}
                                aria-label="Close task details"
                            >
                                ×
                            </button>
                        </div>

                        <div className="task-detail-content">
                            <p className="eyebrow">TASK TITLE</p>
                            <h2>{selectedTask.title}</h2>

                            <p className="eyebrow">DESCRIPTION</p>
                            <p>
                                {selectedTask.description ||
                                    "No description provided."}
                            </p>

                            <p className="eyebrow">PRIORITY</p>

                            <div>
                                <span
                                    className={`priority ${(
                                        selectedTask.priority || "medium"
                                    ).toLowerCase()}`}
                                >
                                    {selectedTask.priority || "Medium"}
                                </span>
                            </div>

                            <p className="eyebrow">ASSIGNEE</p>

                            <p>
                                {selectedTask.assigneeId?.name ||
                                    members.find(
                                        (member) =>
                                            String(member._id) ===
                                            String(
                                                selectedTask.assigneeId?._id ||
                                                    selectedTask.assigneeId
                                            )
                                    )?.name ||
                                    "Unassigned"}
                            </p>

                            <p className="eyebrow">CREATED</p>

                            <p>
                                {selectedTask.createdAt
                                    ? new Date(
                                          selectedTask.createdAt
                                      ).toLocaleString()
                                    : "Not available"}
                            </p>

                            <p className="eyebrow">LAST UPDATED</p>

                            <p>
                                {selectedTask.updatedAt
                                    ? new Date(
                                          selectedTask.updatedAt
                                      ).toLocaleString()
                                    : "Not available"}
                            </p>

                            <p className="eyebrow">VERSION</p>
                            <p>
                                {selectedTask.version ?? "Not available"}
                            </p>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => setSelectedTask(null)}
                                >
                                    Close
                                </button>

                                <button
                                    type="button"
                                    className="primary-button compact"
                                    onClick={() =>
                                        openEditTask(selectedTask)
                                    }
                                >
                                    Edit task
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

// --------------------------------------------------
// STAT COMPONENT
// --------------------------------------------------

function Stat({ label, value, note }) {
    return (
        <article className="stat-card">
            <p>{label}</p>
            <strong>{value}</strong>
            <span>{note}</span>
        </article>
    );
}

// --------------------------------------------------
// MODAL COMPONENT
// --------------------------------------------------

function Modal({ title, onClose, children }) {
    return (
        <div
            className="modal-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <section className="modal">
                <div className="modal-head">
                    <h2>{title}</h2>

                    <button
                        className="icon-button"
                        onClick={onClose}
                        aria-label="Close"
                        type="button"
                    >
                        ×
                    </button>
                </div>

                {children}
            </section>
        </div>
    );
}
