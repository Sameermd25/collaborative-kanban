
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../services/api";

// Get the currently selected tenant.
const getTenantParams = () => ({
    tenantId: localStorage.getItem("activeTenantId"),
});

// Normalize API response data.
const getData = (response) =>
    response.data?.data ?? response.data;

// Get ID whether the value is an object or string.
const getId = (value) =>
    typeof value === "object" ? value?._id : value;

// --------------------------------------------------
// FETCH BOARDS
// --------------------------------------------------

export const fetchBoards = createAsyncThunk(
    "boards/fetchBoards",
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get("/boards", {
                params: getTenantParams(),
            });

            const data = getData(response);

            return Array.isArray(data)
                ? data
                : data.boards || data.data?.boards || [];
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to fetch boards."
            );
        }
    }
);

// --------------------------------------------------
// FETCH MEMBERS
// --------------------------------------------------

export const fetchMembers = createAsyncThunk(
    "boards/fetchMembers",
    async (_, { rejectWithValue }) => {
        try {
            const response = await api.get("/members", {
                params: getTenantParams(),
            });

            const data = getData(response);

            return data.members || data.data?.members || [];
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to fetch members."
            );
        }
    }
);

// --------------------------------------------------
// FETCH BOARD DETAILS
// --------------------------------------------------

export const fetchBoardDetails = createAsyncThunk(
    "boards/fetchBoardDetails",
    async (boardId, { rejectWithValue }) => {
        try {
            const response = await api.get(`/boards/${boardId}`, {
                params: getTenantParams(),
            });

            const data = getData(response);

            const board = data.board || data.data?.board || data;

            const columns =
                data.columns ||
                data.data?.columns ||
                board.columns ||
                [];

            const tasks =
                data.tasks ||
                data.data?.tasks ||
                board.tasks ||
                [];

            return {
                board,
                columns: Array.isArray(columns) ? columns : [],
                tasks: Array.isArray(tasks) ? tasks : [],
            };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to fetch board."
            );
        }
    }
);

// --------------------------------------------------
// CREATE BOARD
// --------------------------------------------------

export const createBoard = createAsyncThunk(
    "boards/createBoard",
    async (payload, { rejectWithValue }) => {
        try {
            const response = await api.post("/boards", payload, {
                params: getTenantParams(),
            });

            const data = getData(response);

            return data.board || data.data?.board || data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to create board."
            );
        }
    }
);

// --------------------------------------------------
// CREATE TASK
// --------------------------------------------------

export const createTask = createAsyncThunk(
    "boards/createTask",
    async (payload, { rejectWithValue }) => {
        try {
            const response = await api.post("/tasks", payload, {
                params: getTenantParams(),
            });

            const data = getData(response);

            return data.task || data.data?.task || data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to create task."
            );
        }
    }
);

// --------------------------------------------------
// UPDATE TASK
// --------------------------------------------------

export const updateTask = createAsyncThunk(
    "boards/updateTask",
    async (
        {
            taskId,
            version,
            title,
            description,
            priority,
            assigneeId,
        },
        { rejectWithValue }
    ) => {
        try {
            const response = await api.patch(
                `/tasks/${taskId}`,
                {
                    version,
                    title,
                    description,
                    priority,
                    assigneeId: assigneeId || null,
                },
                {
                    params: getTenantParams(),
                }
            );

            const data = getData(response);

            return data.task || data.data?.task || data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to update task."
            );
        }
    }
);

// --------------------------------------------------
// DELETE TASK
// --------------------------------------------------

export const deleteTask = createAsyncThunk(
    "boards/deleteTask",
    async (taskId, { rejectWithValue }) => {
        try {
            await api.delete(`/tasks/${taskId}`, {
                params: getTenantParams(),
            });

            return taskId;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to delete task."
            );
        }
    }
);

// --------------------------------------------------
// MOVE TASK
// --------------------------------------------------

export const moveTask = createAsyncThunk(
    "boards/moveTask",
    async (
        { taskId, targetColumnId, version, position },
        { rejectWithValue }
    ) => {
        try {
            const response = await api.patch(
                `/tasks/${taskId}/move`,
                {
                    targetColumnId,
                    version,
                    position,
                },
                {
                    params: getTenantParams(),
                }
            );

            const data = getData(response);

            return data.task || data.data?.task || data;
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Failed to move task."
            );
        }
    }
);

// --------------------------------------------------
// UNDO / REDO HELPER
// --------------------------------------------------

async function applyHistoryChange(entry, currentTask, targetState) {
    let response;

    if (entry.type === "update") {
        response = await api.patch(
            `/tasks/${currentTask._id}`,
            {
                version: currentTask.version,
                title: targetState.title,
                description: targetState.description,
                priority: targetState.priority,
                assigneeId: getId(targetState.assigneeId) || null,
            },
            {
                params: getTenantParams(),
            }
        );
    }

    if (entry.type === "move") {
        response = await api.patch(
            `/tasks/${currentTask._id}/move`,
            {
                version: currentTask.version,
                targetColumnId: getId(targetState.columnId),
                position: targetState.position,
            },
            {
                params: getTenantParams(),
            }
        );
    }

    if (!response) {
        throw new Error("Unsupported history operation.");
    }

    const data = getData(response);

    return data.task || data.data?.task || data;
}

// --------------------------------------------------
// UNDO TASK CHANGE
// --------------------------------------------------

export const undoTaskChange = createAsyncThunk(
    "boards/undoTaskChange",
    async (_, { getState, rejectWithValue }) => {
        try {
            const boardState = getState().boards;

            if (!boardState.history.length) {
                return rejectWithValue("Nothing to undo.");
            }

            const entry =
                boardState.history[boardState.history.length - 1];

            const currentTask = boardState.tasks.find(
                (task) => String(task._id) === String(entry.taskId)
            );

            if (!currentTask) {
                return rejectWithValue(
                    "Task not found. Refresh the board and try again."
                );
            }

            const updatedTask = await applyHistoryChange(
                entry,
                currentTask,
                entry.before
            );

            return {
                task: updatedTask,
                entry,
            };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message ||
                error.message ||
                "Failed to undo task change."
            );
        }
    }
);

// --------------------------------------------------
// REDO TASK CHANGE
// --------------------------------------------------

export const redoTaskChange = createAsyncThunk(
    "boards/redoTaskChange",
    async (_, { getState, rejectWithValue }) => {
        try {
            const boardState = getState().boards;

            if (!boardState.future.length) {
                return rejectWithValue("Nothing to redo.");
            }

            const entry =
                boardState.future[boardState.future.length - 1];

            const currentTask = boardState.tasks.find(
                (task) => String(task._id) === String(entry.taskId)
            );

            if (!currentTask) {
                return rejectWithValue(
                    "Task not found. Refresh the board and try again."
                );
            }

            const updatedTask = await applyHistoryChange(
                entry,
                currentTask,
                entry.after
            );

            return {
                task: updatedTask,
                entry,
            };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message ||
                error.message ||
                "Failed to redo task change."
            );
        }
    }
);

// --------------------------------------------------
// BOARD SLICE
// --------------------------------------------------

const boardSlice = createSlice({
    name: "boards",

    initialState: {
        boards: [],
        activeBoard: null,
        columns: [],
        tasks: [],
        members: [],

        // Undo / Redo history
        history: [],
        future: [],

        loading: false,
        membersLoading: false,
        mutationLoading: false,
        error: null,
    },

    reducers: {
        clearBoardError: (state) => {
            state.error = null;
        },

        resetWorkspace: (state) => {
            state.boards = [];
            state.activeBoard = null;
            state.columns = [];
            state.tasks = [];
            state.members = [];

            // Clear history when changing workspace.
            state.history = [];
            state.future = [];

            state.loading = false;
            state.membersLoading = false;
            state.mutationLoading = false;
            state.error = null;
        },
    },

    extraReducers: (builder) => {
        builder

            // FETCH BOARDS
            .addCase(fetchBoards.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchBoards.fulfilled, (state, action) => {
                state.loading = false;
                state.boards = action.payload;
            })
            .addCase(fetchBoards.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            // FETCH MEMBERS
            .addCase(fetchMembers.pending, (state) => {
                state.membersLoading = true;
            })
            .addCase(fetchMembers.fulfilled, (state, action) => {
                state.membersLoading = false;
                state.members = action.payload;
            })
            .addCase(fetchMembers.rejected, (state, action) => {
                state.membersLoading = false;
                state.error = action.payload;
            })

            // FETCH BOARD DETAILS
            .addCase(fetchBoardDetails.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchBoardDetails.fulfilled, (state, action) => {
                state.loading = false;

                const newBoardId = action.payload.board?._id;
                const oldBoardId = state.activeBoard?._id;

                if (String(newBoardId) !== String(oldBoardId)) {
                    state.history = [];
                    state.future = [];
                }

                state.activeBoard = action.payload.board;
                state.columns = action.payload.columns;
                state.tasks = action.payload.tasks;
            })
            .addCase(fetchBoardDetails.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            // CREATE BOARD
            .addCase(createBoard.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(createBoard.fulfilled, (state, action) => {
                state.mutationLoading = false;
                state.boards.push(action.payload);
            })
            .addCase(createBoard.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // CREATE TASK
            .addCase(createTask.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(createTask.fulfilled, (state, action) => {
                state.mutationLoading = false;
                state.tasks.push(action.payload);

                // New task creation invalidates redo history.
                state.future = [];
            })
            .addCase(createTask.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // UPDATE TASK
            .addCase(updateTask.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(updateTask.fulfilled, (state, action) => {
                state.mutationLoading = false;

                const previousTask = state.tasks.find(
                    (task) => task._id === action.payload._id
                );

                if (previousTask) {
                    state.history.push({
                        type: "update",
                        taskId: action.payload._id,
                        before: { ...previousTask },
                        after: { ...action.payload },
                    });

                    state.future = [];
                }

                state.tasks = state.tasks.map((task) =>
                    task._id === action.payload._id
                        ? action.payload
                        : task
                );
            })
            .addCase(updateTask.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // DELETE TASK
            .addCase(deleteTask.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(deleteTask.fulfilled, (state, action) => {
                state.mutationLoading = false;

                state.tasks = state.tasks.filter(
                    (task) => task._id !== action.payload
                );

                // Do not allow redo of an operation on a deleted task.
                state.history = state.history.filter(
                    (entry) => entry.taskId !== action.payload
                );

                state.future = state.future.filter(
                    (entry) => entry.taskId !== action.payload
                );
            })
            .addCase(deleteTask.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // MOVE TASK
            .addCase(moveTask.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(moveTask.fulfilled, (state, action) => {
                state.mutationLoading = false;

                const previousTask = state.tasks.find(
                    (task) => task._id === action.payload._id
                );

                if (previousTask) {
                    state.history.push({
                        type: "move",
                        taskId: action.payload._id,
                        before: { ...previousTask },
                        after: { ...action.payload },
                    });

                    state.future = [];
                }

                state.tasks = state.tasks.map((task) =>
                    task._id === action.payload._id
                        ? action.payload
                        : task
                );
            })
            .addCase(moveTask.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // UNDO
            .addCase(undoTaskChange.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(undoTaskChange.fulfilled, (state, action) => {
                state.mutationLoading = false;

                const { task, entry } = action.payload;

                state.tasks = state.tasks.map((item) =>
                    item._id === task._id ? task : item
                );

                state.history.pop();
                state.future.push(entry);
            })
            .addCase(undoTaskChange.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            })

            // REDO
            .addCase(redoTaskChange.pending, (state) => {
                state.mutationLoading = true;
                state.error = null;
            })
            .addCase(redoTaskChange.fulfilled, (state, action) => {
                state.mutationLoading = false;

                const { task, entry } = action.payload;

                state.tasks = state.tasks.map((item) =>
                    item._id === task._id ? task : item
                );

                state.future.pop();
                state.history.push(entry);
            })
            .addCase(redoTaskChange.rejected, (state, action) => {
                state.mutationLoading = false;
                state.error = action.payload;
            });
    },
});

// --------------------------------------------------
// EXPORTS
// --------------------------------------------------

export const {
    clearBoardError,
    resetWorkspace,
} = boardSlice.actions;

export const selectCanUndo = (state) =>
    state.boards.history.length > 0;

export const selectCanRedo = (state) =>
    state.boards.future.length > 0;

export default boardSlice.reducer;
