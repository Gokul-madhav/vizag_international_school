// Grouped bar chart — fixed viewBox, bars spread evenly for any number of
// data points, so it never blows up the page with only a few bars.
export default function BarChart({
  data,
  colorCurrent = "#5b5bd6",
  colorPrevious = "#e2e4ee",
}) {
  const W = 640;
  const H = 220;
  const padX = 18;
  const padTop = 16;
  const padBottom = 28;
  const baseY = H - padBottom;
  const plotH = baseY - padTop;
  const plotW = W - padX * 2;

  const rows = data && data.length ? data : [{ day: "", current: 0, previous: null }];
  const n = rows.length;
  const slot = plotW / n;
  const hasPrev = rows.some((d) => d.previous != null);
  const barW = Math.max(6, Math.min(16, slot * (hasPrev ? 0.26 : 0.4)));
  const gap = hasPrev ? Math.min(5, slot * 0.06) : 0;

  const rawMax = Math.max(
    ...rows.flatMap((d) => [Number(d.current) || 0, Number(d.previous) || 0]),
    1
  );
  const max = Math.ceil(rawMax / 10) * 10 || 1;
  const y = (v) => baseY - (Math.max(0, v) / max) * plotH;

  const grid = 4;

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      {Array.from({ length: grid + 1 }).map((_, i) => {
        const gy = padTop + (plotH / grid) * i;
        return (
          <line
            key={i}
            x1={padX}
            x2={W - padX}
            y1={gy}
            y2={gy}
            stroke="#eef0f6"
            strokeDasharray="3 4"
          />
        );
      })}

      {rows.map((d, i) => {
        const cx = padX + slot * i + slot / 2;
        const showPrev = d.previous != null;
        const x0 = showPrev ? cx - barW - gap / 2 : cx - barW / 2;
        const x1 = cx + gap / 2;
        return (
          <g key={i}>
            {showPrev && (
              <rect
                x={x1}
                y={y(d.previous)}
                width={barW}
                height={baseY - y(d.previous)}
                rx="3"
                fill={colorPrevious}
              />
            )}
            <rect
              x={x0}
              y={y(d.current)}
              width={barW}
              height={baseY - y(d.current)}
              rx="3"
              fill={colorCurrent}
            />
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="10.5" fill="#8b95a7">
              {d.day}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
