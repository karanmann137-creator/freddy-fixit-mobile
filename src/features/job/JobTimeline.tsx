// Port of web components/JobTimeline.tsx: the job's live progress rail, derived
// from the job's own timestamps. The derivations are web's, unchanged; "balance
// paid" reads the shared jobFullyFunded (a NULL total_charged is NOT paid).
import React from "react";
import { View } from "react-native";
import { Card, Group, Ic, Stepper, Txt, ui, useTheme, type Step, type StepState } from "@/kit";
import { jobFullyFunded } from "@/lib/jobFunding";

type S = { key: string; label: string; at: string | null; done: boolean };

function fmt(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Edmonton" });
}

export function JobTimeline({ job }: { job: any }) {
  const { t } = useTheme();
  if (!job) return null;
  const paid = job.payment_status === "held" || job.payment_status === "released" || !!job.paid_at;
  const disputed = job.payment_status === "disputed";
  const depRate = Number(job.deposit_rate);
  const split = depRate > 0 && depRate < 1;
  const balancePaid = paid && jobFullyFunded(job);

  const steps: S[] = [
    { key: "matched", label: "Contractor matched", at: job.created_at ?? null, done: true },
    { key: "scheduled", label: "Time scheduled", at: job.client_approved_at ?? null, done: !!job.client_approved_at },
    { key: "paid", label: split ? "Deposit secured" : "Payment secured", at: job.deposit_paid_at ?? job.paid_at ?? null, done: paid },
    { key: "onway", label: "Contractor on the way", at: job.on_my_way_at ?? null, done: !!job.on_my_way_at },
    { key: "done", label: "Work completed", at: job.contractor_completed_at ?? null, done: !!job.contractor_completed_at },
    ...(split ? [{ key: "balance", label: "Balance paid", at: null, done: balancePaid }] : []),
    { key: "confirmed", label: "Confirmed & released", at: job.client_confirmed_at ?? null, done: !!job.client_confirmed_at },
  ];
  const activeIdx = steps.findIndex((s) => !s.done);
  const state = (s: S, i: number): StepState => (s.done ? "done" : i !== activeIdx ? "todo" : disputed ? "review" : "now");
  const ui2: Step[] = steps.map((s, i) => ({ title: s.label, sub: s.done ? (fmt(s.at) ?? undefined) : undefined, state: state(s, i) }));

  return (
    <Group label="Job progress">
      <Card>
        <Stepper steps={ui2} />
        {disputed ? (
          <View style={{ flexDirection: "row", gap: t.s2, alignItems: "center", paddingVertical: t.s3, paddingHorizontal: t.s4, borderTopWidth: t.hairW, borderTopColor: t.hair }}>
            <Ic name="alert-triangle" size={ui.icon.sm} color={t.warn} />
            <Txt size={0.8} color={t.warn} style={{ flex: 1 }}>Paused — a problem was reported and is under review.</Txt>
          </View>
        ) : null}
      </Card>
    </Group>
  );
}
