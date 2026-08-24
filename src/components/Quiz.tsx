"use client";

import { useMemo, useRef, useState } from "react";
import { deriveQuiz, recordQuizAnswer, type ChoiceItem, type QuizItem, type QuizSource, type ReorderItem } from "../lib/quiz";
import { getClientId, logActivity } from "../lib/activity";
import { scheduleSync } from "../edition/client";

/**
 * The quiz surface (work item derived-per-story-quizzes). Items derive
 * from the story's own alignment — tapping through a quiz makes ZERO
 * network calls; answers feed the review loop through the change queue
 * like everything else. Corrective feedback is always shown: retrieval
 * with feedback is the point, not the score.
 */

interface Props {
  source: QuizSource;
  /** the weave difficulty / tier the story was read at — stamped on the
   *  completion activity event */
  difficulty: number;
  onClose: () => void;
}

export default function Quiz({ source, difficulty, onClose }: Props) {
  const [seed, setSeed] = useState(1);
  const quiz = useMemo(() => deriveQuiz(source, { seed }), [source, seed]);

  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<string | null>(null); // chosen option id
  const [order, setOrder] = useState<string[]>([]); // reorder: tapped sequence
  const [results, setResults] = useState<boolean[]>([]);
  const loggedDone = useRef(false);

  const item: QuizItem | undefined = quiz.items[index];
  const done = index >= quiz.items.length;
  const correctCount = results.filter(Boolean).length;

  if (quiz.items.length === 0) {
    return (
      <section className="quiz">
        <h1>Quiz</h1>
        <p className="hint">This story doesn&apos;t carry enough aligned material to quiz — read it and save some phrases instead.</p>
        <button onClick={onClose}>Back to the story</button>
      </section>
    );
  }

  if (done && !loggedDone.current) {
    loggedDone.current = true;
    void logActivity({
      kind: "quiz_completed",
      storyId: quiz.storyId,
      format: quiz.format,
      difficulty: Math.min(5, Math.max(1, difficulty)),
      detail: { correct: correctCount, total: quiz.items.length },
    });
  }

  async function answerChoice(choice: ChoiceItem, optionId: string) {
    if (answered !== null) return;
    setAnswered(optionId);
    const correct = optionId === choice.correctId;
    setResults((r) => [...r, correct]);
    await recordQuizAnswer(quiz, choice, correct, await getClientId());
    scheduleSync();
  }

  function tapReorderLine(reorder: ReorderItem, lineId: string) {
    if (answered !== null || order.includes(lineId)) return;
    const next = [...order, lineId];
    setOrder(next);
    if (next.length === reorder.correctOrder.length) {
      const correct = next.every((id, i) => id === reorder.correctOrder[i]);
      setResults((r) => [...r, correct]);
      setAnswered("done");
    }
  }

  function next() {
    setAnswered(null);
    setOrder([]);
    setIndex((i) => i + 1);
  }

  if (done) {
    return (
      <section className="quiz">
        <h1>Quiz complete</h1>
        <p className="quiz-summary">
          {correctCount} of {quiz.items.length} right — every answer just fed your review deck.
        </p>
        <div className="row">
          <button onClick={onClose}>Back to the story</button>
          <button
            className="secondary"
            onClick={() => {
              loggedDone.current = false;
              setResults([]);
              setIndex(0);
              setAnswered(null);
              setOrder([]);
              setSeed((s) => s + 1);
            }}
          >
            Different questions
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="quiz">
      <h1>
        Quiz
        <button className="linkish practice-exit" onClick={onClose}>
          exit
        </button>
      </h1>
      <p className="hint">
        {index + 1} of {quiz.items.length}
      </p>

      {item!.kind !== "reorder" && (
        <div className="quiz-item">
          <p className="quiz-prompt" lang={(item as ChoiceItem).promptLang}>
            {(item as ChoiceItem).kind === "which-line" ? <>Which line says: &ldquo;{(item as ChoiceItem).prompt}&rdquo;</> : (item as ChoiceItem).prompt}
          </p>
          {(item as ChoiceItem).kind === "meaning" && <p className="quiz-sub">What does it mean?</p>}
          <div className="quiz-options">
            {(item as ChoiceItem).options.map((o) => {
              const choice = item as ChoiceItem;
              const isCorrect = o.id === choice.correctId;
              const cls =
                answered === null
                  ? ""
                  : isCorrect
                    ? " correct"
                    : o.id === answered
                      ? " wrong"
                      : " dim";
              return (
                <button
                  key={o.id}
                  lang={choice.optionsLang}
                  className={`quiz-option${cls}`}
                  onClick={() => void answerChoice(choice, o.id)}
                >
                  {o.text}
                </button>
              );
            })}
          </div>
          {answered !== null && (
            <p className="quiz-feedback">
              {answered === (item as ChoiceItem).correctId ? "Right." : "Not quite — the answer is highlighted."}{" "}
              <span lang={quiz.targetLang}>{(item as ChoiceItem).targetText}</span> ·{" "}
              <span>{(item as ChoiceItem).l1Text}</span>
            </p>
          )}
        </div>
      )}

      {item!.kind === "reorder" && (
        <div className="quiz-item">
          <p className="quiz-prompt">{(item as ReorderItem).prompt}</p>
          <div className="quiz-options">
            {(item as ReorderItem).lines.map((line) => {
              const reorder = item as ReorderItem;
              const placed = order.indexOf(line.id);
              const cls =
                answered === null
                  ? placed >= 0
                    ? " dim"
                    : ""
                  : reorder.correctOrder[placed] === line.id || (placed >= 0 && order[placed] === reorder.correctOrder[placed])
                    ? " correct"
                    : " wrong";
              return (
                <button
                  key={line.id}
                  lang={reorder.optionsLang}
                  className={`quiz-option${cls}`}
                  onClick={() => tapReorderLine(reorder, line.id)}
                >
                  {placed >= 0 && <span className="quiz-order">{placed + 1}</span>}
                  {line.text}
                </button>
              );
            })}
          </div>
          {answered !== null && (
            <p className="quiz-feedback">
              {results[results.length - 1] ? "Right order." : "Not quite — the order was:"}
              {!results[results.length - 1] && (
                <span className="quiz-correct-order">
                  {(item as ReorderItem).correctOrder.map((id, i) => {
                    const line = (item as ReorderItem).lines.find((l) => l.id === id);
                    return (
                      <span key={id} lang={(item as ReorderItem).optionsLang}>
                        {i + 1}. {line?.text}
                      </span>
                    );
                  })}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {answered !== null && (
        <button className="primary" onClick={next}>
          {index + 1 === quiz.items.length ? "Finish" : "Continue"}
        </button>
      )}
    </section>
  );
}
