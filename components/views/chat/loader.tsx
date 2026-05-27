export const TypingDotsBubble: React.FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex justify-start pr-9 pl-0.5 pt-1"
    >
      <span className="sr-only">Thinking</span>
      <div className="inline-flex items-center gap-1.25 rounded-[1.125rem] border border-zinc-700/50 bg-zinc-900/80 px-[0.9rem] py-2 shadow-inner shadow-black/35">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="size-1.75 animate-bounce rounded-full bg-zinc-500"
            style={{
              animationDuration: "0.65s",
              animationDelay: `${i * 130}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
