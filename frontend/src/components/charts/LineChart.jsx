// Two-series line chart — pure SVG, scales to width.
export default function LineChart({
  labels,
  current,
  previous,
  colorCurrent = "#5b5bd6",
  colorPrevious = "#d7dae6",
  height = 220,
}) {
  const width = 560;
  const padX = 14;
  const padTop = 16;
  const padBottom = 28;
  const baseY = height - padBottom;
  const plotH = baseY - padTop;
  const plotW = width - padX * 2;

  const all = [...current, ...previous];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;

  const x = (i) => padX + (plotW / (labels.length - 1)) * i;
  const y = (v) => baseY - ((v - lo) / (hi - lo)) * plotH;

  const toPath = (arr) => arr.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const gy = padTop + (plotH / 4) * i;
        return (
          <line
            key={i}
            x1={padX}
            x2={width - padX}
            y1={gy}
            y2={gy}
            stroke="#eef0f6"
            strokeDasharray="3 4"
          />
        );
      })}

      <polyline
        points={toPath(previous)}
        fill="none"
        stroke={colorPrevious}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={toPath(current)}
        fill="none"
        stroke={colorCurrent}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {current.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={colorCurrent} strokeWidth="2.5" />
      ))}

      {labels.map((l, i) => (
        <text
          key={l}
          x={x(i)}
          y={height - 8}
          textAnchor="middle"
          fontSize="11"
          fill="#8b95a7"
        >
          {l}
        </text>
      ))}
    </svg>
  );
}
