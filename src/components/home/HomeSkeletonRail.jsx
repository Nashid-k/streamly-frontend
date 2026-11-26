import { memo } from "react";

const HomeSkeletonRail = memo(function HomeSkeletonRail({
  cards = 8,
  label = "Loading titles",
  scene = "home",
  headVariant = "title",
  rowIndex = 0,
}) {
  const isProviderDock = scene === "provider";
  const isContinue = scene === "continue";
  const effectiveHead = isContinue ? "action" : headVariant;

  return (
    <section
      className="sh in home-rail home-rail--skeleton"
      data-sk-scene={scene}
      style={{ "--row-i": Math.min(rowIndex, 5) }}
      aria-label={label}
      aria-hidden="true"
    >
      {effectiveHead === "menu" ? (
        <div className="sh-head">
          <div className="rail-menu rail-menu--inline rail-menu--skeleton">
            <span className="sk sk-h2 sk-h2--prefix" />
            <span className="sk sk-menu-pill" />
          </div>
        </div>
      ) : effectiveHead === "action" ? (
        <div className="sh-head home-rail-head">
          <h2 className="sk sk-h2" />
          <span className="sk sk-edit-pill" />
        </div>
      ) : (
        <div className="sh-head">
          <h2 className="sk sk-h2" />
        </div>
      )}
      <span className="ar l glass sk-ar" />
      <span className="ar r glass sk-ar" />
      <div className={isProviderDock ? "rail provider-icon-grid" : "rail"}>
        {Array.from({ length: cards }, (_, index) => (
          <div className="cw sk-cw" key={index} style={{ "--i": Math.min(index, 5) }}>
            <div className="cd">
              <div className="po sk">
                {isContinue ? <span className="sk-progress-track" /> : null}
              </div>
              <span className="sk sk-ctitle" />
              <small className="sk sk-cmeta" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

export default HomeSkeletonRail;
