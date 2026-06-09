type Props = {
  title: string;
  description: string;
};

export default function ComingSoon({ title, description }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
      <span
        className="text-xs uppercase tracking-widest"
        style={{ color: "#6366f1", fontFamily: "var(--font-geist-mono)" }}
      >
        {title}
      </span>
      <p className="text-sm text-center max-w-xs" style={{ color: "#555555" }}>
        {description}
      </p>
    </div>
  );
}
