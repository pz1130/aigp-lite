interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({
  values,
  width = 100,
  height = 28,
  className,
}: SparklineProps) {
  if (values.length === 0)
    return <svg width={width} height={height} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / Math.max(values.length - 1, 1);

  const points = values
    .map(
      (v, i) =>
        `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * (height - 4) - 2).toFixed(1)}`,
    )
    .join(" ");

  const last = values[values.length - 1];
  const lastY = (height - ((last - min) / range) * (height - 4) - 2).toFixed(1);
  const lastX = ((values.length - 1) * stepX).toFixed(1);

  return (
    <svg width={width} height={height} className={className}>
      <defs>
        <linearGradient id={`sg-${className}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`0,${height} ${points} ${lastX},${height}`}
        fill={`url(#sg-${className})`}
        strokeWidth="0"
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last point dot */}
      <circle cx={lastX} cy={lastY} r="2" fill="currentColor" />
    </svg>
  );
}
