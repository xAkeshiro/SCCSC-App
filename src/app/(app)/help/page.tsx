import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Help" };

const FAQ: { q: string; a: string }[] = [
  {
    q: "When should I log a trip?",
    a: "Right after you drive is easiest, from your phone. You can also add several at once later from a computer. Trips stay saved until you submit them.",
  },
  {
    q: "How are miles worked out?",
    a: "When you pick saved places (like the main office or a school site), the app estimates the miles for you. If the real distance was different, change it and add a short reason, such as a detour. For other addresses, type the miles from your map app or odometer.",
  },
  {
    q: "What counts as a business trip?",
    a: "Driving your own car for SCCSC work: between sites, to meetings, to deliver supplies. Your normal drive between home and your usual workplace is a commute and isn't reimbursed. If you're not sure, ask your coordinator.",
  },
  {
    q: "How do I get paid?",
    a: "Submit your trips as a claim. Your coordinator approves it, then finance adds it to the next payment batch. You'll see each step on the claim, and on your home page.",
  },
  {
    q: "My claim was returned. What now?",
    a: "Open the claim and read your coordinator's comment. Fix the trips it mentions, then press Resubmit.",
  },
  {
    q: "How does the phone bill work?",
    a: "SCCSC pays a set amount each month for using your own phone for work. The Phone bill page shows the amount and which months are ready to claim (every couple of months): check them, add a photo or PDF of your bill, and send the claim. It goes to your coordinator like a mileage claim, and each month can only be claimed once.",
  },
  {
    q: "Who can see my trips?",
    a: "You, your coordinator, and finance once a claim is approved. If a trip starts or ends at a place saved as Home, others see the word Home, not your address.",
  },
  {
    q: "I can't sign in.",
    a: "Use the email payroll has for you (or tap “Use phone number instead” for your mobile number), and your name as it appears on your paycheck. If you're new or your details changed, sign in anyway and an admin will approve you, usually within a day or two.",
  },
];

export default async function HelpPage() {
  await requireViewer();
  return (
    <Container className="max-w-3xl py-8">
      <PageHeader eyebrow="Help" title="Questions and answers" />
      <div className="space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="card group p-5 open:shadow-[var(--shadow-card)]">
            <summary className="cursor-pointer list-none font-display text-lg font-semibold marker:hidden">
              <span className="mr-2 inline-block text-brand-600 transition-transform group-open:rotate-90">›</span>
              {item.q}
            </summary>
            <p className="mt-3 text-ink-700">{item.a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
