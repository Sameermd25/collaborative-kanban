import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../services/api";

const getDefaultTenantId = (memberships) => {
    const firstTenant = memberships?.[0]?.tenantId;

    return typeof firstTenant === "object"
        ? firstTenant?._id || ""
        : firstTenant || "";
};

export const loginUser = createAsyncThunk(
    "auth/login",
    async (credentials, { rejectWithValue }) => {
        try {
            const response = await api.post("/auth/login", credentials);

            const data = response.data;
            const token = data.token || data.data?.token;

            if (!token) {
                return rejectWithValue("Login response did not contain a token.");
            }

            const user = data.user || data.data?.user || null;
            const memberships =
                data.memberships || data.data?.memberships || [];

            const storedTenantId = localStorage.getItem("activeTenantId");

            const activeTenantId = memberships.some((membership) => {
                const id =
                    typeof membership.tenantId === "object"
                        ? membership.tenantId?._id
                        : membership.tenantId;

                return String(id) === String(storedTenantId);
            })
                ? storedTenantId
                : getDefaultTenantId(memberships);

            if (activeTenantId) {
                // localStorage.setItem("activeTenantId", activeTenantId);
                if (activeTenantId) {
                    localStorage.setItem("activeTenantId", activeTenantId);
                } else {
                    localStorage.removeItem("activeTenantId");
                }
            }

            localStorage.setItem("token", token);
            localStorage.setItem("user", JSON.stringify(user));
            localStorage.setItem("memberships", JSON.stringify(memberships));

            return { token, user, memberships, activeTenantId };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Login failed."
            );
        }
    }
);

export const registerUser = createAsyncThunk(
    "auth/register",
    async (formData, { rejectWithValue }) => {
        try {
            const response = await api.post("/auth/register", {
                name: formData.name,
                email: formData.email,
                password: formData.password,
                organizationName: formData.organizationName,
                tenantName: "Main Workspace",
            });

            const data = response.data;
            const token = data.token || data.data?.token;
            const user = data.user || data.data?.user || null;
            const memberships =
                data.memberships || data.data?.memberships || [];

            const activeTenantId = getDefaultTenantId(memberships);

            if (activeTenantId) {
                localStorage.setItem("activeTenantId", activeTenantId);
            }

            if (token) localStorage.setItem("token", token);
            if (user) localStorage.setItem("user", JSON.stringify(user));

            localStorage.setItem(
                "memberships",
                JSON.stringify(memberships)
            );

            return { token, user, memberships, activeTenantId };
        } catch (error) {
            return rejectWithValue(
                error.response?.data?.message || "Registration failed."
            );
        }
    }
);

const authSlice = createSlice({
    name: "auth",

    initialState: {
        token: localStorage.getItem("token"),
        activeTenantId: localStorage.getItem("activeTenantId"),
        user: JSON.parse(localStorage.getItem("user") || "null"),
        memberships: JSON.parse(
            localStorage.getItem("memberships") || "[]"
        ),
        loading: false,
        error: null,
    },

    reducers: {
        logout: (state) => {
            state.token = null;
            state.user = null;
            state.memberships = [];

            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("memberships");

            state.activeTenantId = null;
            localStorage.removeItem("activeTenantId");
        },
        setActiveTenant: (state, action) => {
            state.activeTenantId = action.payload;

            if (action.payload) {
                localStorage.setItem("activeTenantId", action.payload);
            } else {
                localStorage.removeItem("activeTenantId");
            }
        },

        clearAuthError: (state) => {
            state.error = null;
        },
    },

    extraReducers: (builder) => {
        builder
            .addCase(loginUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(loginUser.fulfilled, (state, action) => {
                state.loading = false;
                state.token = action.payload.token;
                state.user = action.payload.user;
                state.memberships = action.payload.memberships;
                state.activeTenantId = action.payload.activeTenantId;
            })
            .addCase(loginUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })

            .addCase(registerUser.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(registerUser.fulfilled, (state, action) => {
                state.loading = false;
                state.token = action.payload.token;
                state.user = action.payload.user;
                state.memberships = action.payload.memberships;
                state.activeTenantId = action.payload.activeTenantId;
            })
            .addCase(registerUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export const { logout, clearAuthError, setActiveTenant } = authSlice.actions;

export default authSlice.reducer;