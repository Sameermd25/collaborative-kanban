import { configureStore } from "@reduxjs/toolkit";

import authReducer from "../features/auth/authSlice";
import boardReducer from "../features/boards/boardSlice";
import themeReducer from "../features/theme/themeSlice";
import activityReducer from "../features/activity/activitySlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    boards: boardReducer,
    theme: themeReducer,
    activity: activityReducer,
  },
});