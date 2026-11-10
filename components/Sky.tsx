// Day-mode background: glowing sun and drifting clouds (pure CSS, shown only when data-theme=light).
export default function Sky() {
  return (
    <div className="sky" aria-hidden="true">
      <i className="sun" />
      <i className="cloud c1" /><i className="cloud c2" /><i className="cloud c3" /><i className="cloud c4" />
    </div>
  );
}
