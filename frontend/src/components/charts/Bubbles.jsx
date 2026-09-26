// Overlapping "rating" bubbles, like the reference mock. Expects 3 metrics.
const LAYOUT = [
  { top: "0%", left: "6%", scale: 0.62 },
  { top: "44%", left: "0%", scale: 0.72 },
  { top: "10%", left: "40%", scale: 1 },
];

export default function Bubbles({ metrics }) {
  const items = metrics.slice(0, 3);
  return (
    <div className="bubbles">
      {items.map((m, i) => {
        const pos = LAYOUT[i] ?? LAYOUT[2];
        const dim = 150 * pos.scale;
        return (
          <div
            key={m.label}
            className="bubble"
            style={{
              top: pos.top,
              left: pos.left,
              width: dim,
              height: dim,
              background: m.color,
            }}
          >
            <div>
              <b>{m.value}%</b>
              <span>{m.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
