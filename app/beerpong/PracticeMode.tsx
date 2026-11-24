"use client";

import { useState } from "react";
import { createPracticeEngine } from "../../lib/beerpongPractice";
import TargetGame from "./TargetGame";
import styles from "./raffle.module.css";

/**
 * The standalone demo deliberately uses no authentication, network requests
 * or edition IDs. Results exist only in this browser session.
 */
export default function PracticeMode() {
  const [started, setStarted] = useState(false);
  const [engine, setEngine] = useState(createPracticeEngine);
  const [session, setSession] = useState(0);

  function restart() {
    setEngine(createPracticeEngine());
    setSession(value => value + 1);
    setStarted(true);
  }

  return (
    <section id="demo" className={styles.practiceSection} aria-labelledby="demo-title">
      <div className={styles.practiceIntro}>
        <div>
          <span className={styles.practiceKicker}>◎ MOD DEMO · DISPONIBIL ORICÂND</span>
          <h2 id="demo-title">Antrenează-te la BeerPong</h2>
          <p>Testează-ți precizia și încearcă să nimerești halba. Aceeași minge, aceleași ricoșeuri și același joc ca în competiție!</p>
          <div className={styles.practiceFacts}>
            <span>Fără cont</span>
            <span>Fără limită de timp</span>
            <span>Oricâte aruncări</span>
          </div>
          <div className={styles.practiceActions}>
            <button type="button" className={styles.practiceStart} onClick={() => setStarted(value => !value)}
              aria-expanded={started} aria-controls="beerpong-practice-game">
              {started ? "Ascunde jocul" : "Joacă demo gratuit"} <span aria-hidden="true">{started ? "↑" : "→"}</span>
            </button>
            {started && <button type="button" className={styles.practiceReset} onClick={restart}>Reia de la zero ↺</button>}
          </div>
        </div>
        <div className={styles.practiceDecoration} aria-hidden="true">
          <span className={styles.practiceBall}>●</span>
          <span className={styles.practiceArc}>⌁</span>
          <span className={styles.practiceCup}>★</span>
        </div>
      </div>
      {started && (
        <div id="beerpong-practice-game" className={styles.practiceGame}>
          <p className={styles.practiceDisclaimer}>Mod de antrenament · Scorul rămâne doar în această sesiune și nu se adaugă în clasamentele sau premiile competițiilor.</p>
          <TargetGame key={session} serve={engine.serve} finish={engine.finish} initialScore={0}/>
        </div>
      )}
    </section>
  );
}
