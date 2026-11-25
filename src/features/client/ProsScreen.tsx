// My Pros (PLAN step 4.14): port of web ClientProsTab. Data is `list_my_pros`, read
// once by useClientData(); a pull re-reads it. Favourite flips optimistically and
// is settled by `toggle_favorite`'s answer, exactly as web toggleFav.
import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Button, Card, DeadEnd, Group, Row, Screen, ScreenHeader, SkRow, Txt, notify, rgba, useDelayed, useTheme } from "@/kit";
import { supabase } from "@/lib/supabase";
import { useClientData } from "./data";

const subFor = (pro: any) =>
  (pro.rating ? `★ ${Number(pro.rating).toFixed(1)}` : "New")
  + (pro.jobs_together ? ` · ${pro.jobs_together} job${pro.jobs_together === 1 ? "" : "s"} together` : "")
  + (pro.last_service ? ` · last: ${pro.last_service}` : "");

export function ProsScreen() {
  const { t } = useTheme();
  const { state, reload } = useClientData();
  // Optimistic / server-confirmed favourite flags, by contractor id.
  const [fav, setFav] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const showSkeleton = useDelayed();

  const refresh = async () => { setFav({}); await reload(); };

  if (state.kind === "error") {
    return <DeadEnd msg="We couldn't load your pros. Check your connection, then try again." onRetry={() => void reload()} />;
  }
  if (state.kind === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Your pros" back={false} />
        {showSkeleton ? <View style={{ paddingTop: t.s6, gap: t.s4 }}><SkRow /><SkRow /><SkRow /></View> : null}
      </Screen>
    );
  }
  const pros: any[] = state.data.pros;
  const prosFailed: boolean = state.data.prosFailed;
  const isFav = (p: any) => (p.contractor_id in fav ? fav[p.contractor_id] : p.is_favorite === true);

  const toggleFav = async (id: string) => {
    if (busy[id]) return;
    const before = pros.find((p) => p.contractor_id === id);
    const was = before ? isFav(before) : false;
    setBusy((b) => ({ ...b, [id]: true }));
    setFav((f) => ({ ...f, [id]: !was }));
    try {
      const { data, error } = await supabase.rpc("toggle_favorite", { p_contractor_id: id });
      if (error) throw error;
      setFav((f) => ({ ...f, [id]: data === true }));
    } catch {
      setFav((f) => ({ ...f, [id]: was }));
      notify("Couldn't update your favourites. Please try again.", "danger");
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  // Web rehire: /client-onboarding?pro=<id>&service=<last_service>. The app's
  // new-request screen is still a stub; it will read the same two params.
  const rehire = (pro: any) => {
    const params: Record<string, string> = { pro: pro.contractor_id };
    if (pro.last_service) params.service = pro.last_service;
    router.push({ pathname: "/client/new-request", params });
  };

  return (
    <Screen onRefresh={refresh}>
      <ScreenHeader title="Your pros" back={false} />
      {prosFailed ? (
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="alert-triangle" tone="warn" title="We couldn't load your pros." sub="Tap to try again." onPress={() => void refresh()} />
        </Card>
      ) : null}
      {prosFailed && pros.length === 0 ? null : pros.length === 0 ? (
        <Card style={{ marginTop: t.s6 }}>
          <Row icon="user-check" tone="neutral" title="No pros yet"
            sub="Once you have worked with a contractor, they will show up here so you can rebook them in one tap." />
        </Card>
      ) : (
        <Group label="Your pros" action={<Txt size={0.8} color={rgba(t.muted, 0.7)}>{String(pros.length)}</Txt>}>
          <Txt size={0.8} color={rgba(t.muted, 0.7)} style={{ marginBottom: t.s3, paddingHorizontal: t.s3 }}>
            Rebook someone you trust. They will be requested directly.
          </Txt>
          <Card>
            {pros.map((pro) => (
              <Row
                key={pro.contractor_id}
                icon="user-check"
                tone="neutral"
                title={pro.company_name || pro.name || "Your pro"}
                sub={subFor(pro)}
                accessibilityLabel={"View " + (pro.company_name || pro.name || "your pro") + "'s profile"}
                onPress={() => router.push({ pathname: "/pro/[id]", params: { id: pro.contractor_id } })}
                right={
                  <View style={{ flexDirection: "row", alignItems: "center", gap: t.s2 }}>
                    <Button variant="ghost" accessibilityLabel={isFav(pro) ? "Remove favourite" : "Add favourite"} onPress={() => void toggleFav(pro.contractor_id)}>
                      <Txt size={1.1} color={isFav(pro) ? t.text : rgba(t.muted, 0.6)}>{isFav(pro) ? "♥" : "♡"}</Txt>
                    </Button>
                    <Button onPress={() => rehire(pro)}>Book again</Button>
                  </View>
                }
              />
            ))}
          </Card>
        </Group>
      )}
    </Screen>
  );
}
