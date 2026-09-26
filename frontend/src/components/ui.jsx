import { IconArrowDown, IconArrowUp } from "./Icons.jsx";

export function Card({ title, subtitle, action, className = "", children }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card__head">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ViewReport() {
  return <button className="link-btn">View Report</button>;
}

export function Delta({ pct, up, note }) {
  return (
    <div className={`delta ${up ? "delta--up" : "delta--down"}`}>
      {up ? <IconArrowUp /> : <IconArrowDown />}
      {pct}%{note && <span className="delta__note">{note}</span>}
    </div>
  );
}

export function StatCard({ label, value, changePct, trendUp }) {
  return (
    <div className="card stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {changePct != null && (
        <Delta pct={changePct} up={trendUp} note="vs last week" />
      )}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i className="dot" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ListCard({ title, subtitle, items }) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="list">
        {items.map((it) => (
          <div className="list__row" key={it.name}>
            <div className="list__badge">
              {it.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase()}
            </div>
            <div className="list__main">
              <div className="list__name">{it.name}</div>
              <div className="list__meta">{it.meta}</div>
            </div>
            <div className="list__value">{it.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
