import styles from "./CssStarfield.module.css";

export function CssStarfield() {
  return (
    <div className={styles.root} aria-hidden="true">
      <div className={styles.stars} />
    </div>
  );
}
