import { Lang } from "@/components/lang";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 text-sm text-muted">
        <Lang
          simple={<p>Practice site. Not a real bank account.</p>}
          detailed={
            <p>
              SpendSense demo for a Capital One hackathon. Sample data only.
              Not a real account: payments, disputes and card pauses are simulated and no money moves.
            </p>
          }
        />
      </div>
    </footer>
  );
}
