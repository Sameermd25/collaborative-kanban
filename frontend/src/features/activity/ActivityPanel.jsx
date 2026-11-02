import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchActivity } from "./activitySlice";

export default function ActivityPanel() {
  const dispatch = useDispatch();

  const { items, loading, error } = useSelector(
    (state) => state.activity
  );

  const activeTenantId = useSelector(
    (state) => state.auth.activeTenantId
  );

  useEffect(() => {
    if (!activeTenantId) return;

    dispatch(fetchActivity());
  }, [dispatch, activeTenantId]);

  return (
    <section className="activity-panel">
      <div className="section-heading">
        <p className="eyebrow">WORKSPACE UPDATES</p>
        <h2>Recent activity</h2>
      </div>

      {loading && <p className="muted">Loading activity...</p>}

      {error && <p className="muted">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="muted">No recent activity.</p>
      )}

      <div className="activity-list">
        {items.map((item, index) => (
          <div
            className="activity-item"
            key={item._id || index}
          >
            <span className="activity-icon">↗</span>

            <div>
              <strong>
                {item.action || item.type || "Workspace update"}
              </strong>

              <p>
                {item.description ||
                  item.message ||
                  item.entityType ||
                  "An activity was recorded."}
              </p>
            </div>

            <time>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleString()
                : ""}
            </time>
          </div>
        ))}
      </div>
    </section>
  );
}