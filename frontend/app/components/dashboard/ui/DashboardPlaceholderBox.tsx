"use client";

type DashboardPlaceholderBoxProps = {
  text?: string;
  heightClassName?: string;
};

export default function DashboardPlaceholderBox({
  text = "",
  heightClassName = "min-h-[150px]",
}: DashboardPlaceholderBoxProps) {
  return (
    <div
      className={[
        "flex w-full items-center justify-center rounded-lg border border-dashed text-[11px] ui-muted",
        heightClassName,
      ].join(" ")}
      style={{
        borderColor: "var(--card-border)",
        background: "var(--main-bg)",
      }}
    >
      {text || " "}
    </div>
  );
}