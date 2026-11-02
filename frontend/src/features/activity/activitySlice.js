
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import api from "../../services/api";

export const fetchActivity = createAsyncThunk(
  "activity/fetchActivity",
  async (_, { rejectWithValue }) => {
    try {
      const tenantId = localStorage.getItem("activeTenantId");

      if (!tenantId) {
        return rejectWithValue("No active workspace selected.");
      }

      const response = await api.get("/activity", {
        params: {
          tenantId,
          page: 1,
          limit: 8,
        },
      });

      const data = response.data?.data ?? response.data;

      return data.activities || data.logs || [];
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to load activity."
      );
    }
  }
);

const activitySlice = createSlice({
  name: "activity",

  initialState: {
    items: [],
    loading: false,
    error: null,
  },

  reducers: {
    clearActivity: (state) => {
      state.items = [];
      state.loading = false;
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchActivity.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.items = [];
      })
      .addCase(fetchActivity.fulfilled, (state, action) => {
        state.loading = false;
        state.items = Array.isArray(action.payload)
          ? action.payload
          : [];
      })
      .addCase(fetchActivity.rejected, (state, action) => {
        state.loading = false;
        state.items = [];
        state.error = action.payload;
      });
  },
});

export const { clearActivity } = activitySlice.actions;

export default activitySlice.reducer;
