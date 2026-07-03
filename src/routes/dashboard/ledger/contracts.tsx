import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/ledger/contracts")({ component: Page });

interface ContractRow {
  id: string; system_id: string | null; contract_url: string | null; billing_type: string | null;
  contract_amount: number | null; dev_fee: number | null; maintenance_fee: number | null;
  next_payment_date: string | null; payment_status: string; invoice_status: string; note: string | null;
}
const empty: Partial<ContractRow> = { payment_status: "未收", invoice_status: "未開" };

function useLookups(category: string) {
  return useQuery({
    queryKey: ["lookups", category],
    queryFn: async () => {
      const { data } = await supabase.from("lookups").select("code,label").eq("category", category).eq("is_active", true).order("sort_order");
      return (data ?? []) as { code: string; label: string }[];
    },
  });
}
const money = (n: number | null) => (n == null ? "—" : n.toLocaleString("zh-TW"));
function payTint(date: string | null, status: string) {
  if (!date || status === "已收") return "";
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (days < 0) return "bg-red-50 dark:bg-red-950/30";
  if (days <= 30) return "bg-amber-50 dark:bg-amber-950/30";
  return "";
}

function Page() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canCreate = can("ledger", "create"), canEdit = can("ledger", "edit"), canDelete = can("ledger", "delete");
  const [payFilter, setPayFilter] = useState("all");
  const { data: billingOpts = [] } = useLookups("billing_type");
  const { data: payOpts = [] } = useLookups("payment_status");
  const { data: invOpts = [] } = useLookups("invoice_status");

  const { data: systems = [] } = useQuery({
    queryKey: ["systems-mini"],
    queryFn: async () => {
      const { data } = await supabase.from("systems").select("id,code,name").order("code");
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });
  const sysLabel = (id: string | null) => {
    const s = systems.find((x) => x.id === id);
    return s ? `${s.code} · ${s.name}` : "—";
  };

  const { data: rows = [] } = useQuery({
    queryKey: ["contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").order("next_payment_date", { nullsFirst: false });
      if (error) throw error;
      return data as ContractRow[];
    },
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["contracts"] });

  const [form, setForm] = useState<Partial<ContractRow> | null>(null);
  const isNew = form && !form.id;
  const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const save = async () => {
    if (!form?.system_id) { toast.error("請選擇對應系統"); return; }
    const payload = {
      system_id: form.system_id, contract_url: form.contract_url || null,
      billing_type: form.billing_type || null, contract_amount: numOrNull(form.contract_amount),
      dev_fee: numOrNull(form.dev_fee), maintenance_fee: numOrNull(form.maintenance_fee),
      next_payment_date: form.next_payment_date || null,
      payment_status: form.payment_status || "未收", invoice_status: form.invoice_status || "未開",
      note: form.note || null,
    };
    const { error } = isNew
      ? await supabase.from("contracts").insert(payload)
      : await supabase.from("contracts").update(payload).eq("id", form!.id!);
    if (error) { toast.error(error.message); return; }
    toast.success(isNew ? "已新增合約" : "已更新"); setForm(null); reload();
  };
  const del = async (r: ContractRow) => {
    if (!confirm("確定刪除此合約？")) return;
    const { error } = await supabase.from("contracts").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("已刪除"); reload();
  };

  const filtered = payFilter === "all" ? rows : rows.filter((r) => r.payment_status === payFilter);

  return (
    <div className="space-y-6">
      <PageHeader title="合約與費用" description="各系統的合約、金額與收款/發票狀態" actions={canCreate ? (
        <Dialog open={!!isNew} onOpenChange={(o) => !o && setForm(null)}>
          <DialogTrigger asChild><Button onClick={() => setForm({ ...empty })}>新增合約</Button></DialogTrigger>
          <ContractForm form={form} setForm={setForm} save={save} isNew systems={systems}
            billingOpts={billingOpts} payOpts={payOpts} invOpts={invOpts} sysLabel={sysLabel} />
        </Dialog>
      ) : undefined} />

      <div className="flex items-center gap-2">
        <Label className="text-sm text-muted-foreground">收款狀態</Label>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            {payOpts.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>系統</TableHead><TableHead>收費模式</TableHead><TableHead className="text-right">合約金額</TableHead>
                <TableHead>下次收款日</TableHead><TableHead>收款</TableHead><TableHead>發票</TableHead>
                <TableHead>合約檔</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} className={payTint(r.next_payment_date, r.payment_status)}>
                  <TableCell className="font-medium">{sysLabel(r.system_id)}</TableCell>
                  <TableCell>{r.billing_type ?? "—"}</TableCell>
                  <TableCell className="text-right">{money(r.contract_amount)}</TableCell>
                  <TableCell>{r.next_payment_date ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{r.payment_status}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{r.invoice_status}</Badge></TableCell>
                  <TableCell>{r.contract_url ? <a href={r.contract_url} target="_blank" rel="noreferrer" className="text-primary underline">開啟</a> : "—"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {canEdit && <Button size="sm" variant="outline" onClick={() => setForm({ ...r })}>編輯</Button>}
                    {canDelete && <Button size="sm" variant="outline" onClick={() => del(r)}>刪除</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">尚無合約</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!form && !isNew} onOpenChange={(o) => !o && setForm(null)}>
        <ContractForm form={form} setForm={setForm} save={save} isNew={false} systems={systems}
          billingOpts={billingOpts} payOpts={payOpts} invOpts={invOpts} sysLabel={sysLabel} />
      </Dialog>
    </div>
  );
}

function ContractForm({ form, setForm, save, isNew, systems, billingOpts, payOpts, invOpts }: {
  form: Partial<ContractRow> | null; setForm: (f: Partial<ContractRow> | null) => void; save: () => void; isNew: boolean;
  systems: { id: string; code: string; name: string }[];
  billingOpts: { code: string; label: string }[]; payOpts: { code: string; label: string }[];
  invOpts: { code: string; label: string }[]; sysLabel: (id: string | null) => string;
}) {
  if (!form) return null;
  const set = (k: keyof ContractRow, v: string) => setForm({ ...form, [k]: v });
  return (
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{isNew ? "新增合約" : "編輯合約"}</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="對應系統" full>
          <Select value={form.system_id ?? ""} onValueChange={(v) => set("system_id", v)}>
            <SelectTrigger><SelectValue placeholder="選擇系統" /></SelectTrigger>
            <SelectContent>{systems.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} · {s.name}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="收費模式">
          <Select value={form.billing_type ?? ""} onValueChange={(v) => set("billing_type", v)}>
            <SelectTrigger><SelectValue placeholder="選擇" /></SelectTrigger>
            <SelectContent>{billingOpts.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="下次收款日"><Input type="date" value={form.next_payment_date ?? ""} onChange={(e) => set("next_payment_date", e.target.value)} /></F>
        <F label="合約金額"><Input type="number" value={form.contract_amount ?? ""} onChange={(e) => set("contract_amount", e.target.value)} /></F>
        <F label="開發費"><Input type="number" value={form.dev_fee ?? ""} onChange={(e) => set("dev_fee", e.target.value)} /></F>
        <F label="維護費"><Input type="number" value={form.maintenance_fee ?? ""} onChange={(e) => set("maintenance_fee", e.target.value)} /></F>
        <F label="收款狀態">
          <Select value={form.payment_status ?? "未收"} onValueChange={(v) => set("payment_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{payOpts.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="發票狀態">
          <Select value={form.invoice_status ?? "未開"} onValueChange={(v) => set("invoice_status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{invOpts.map((o) => <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="合約檔連結" full><Input value={form.contract_url ?? ""} onChange={(e) => set("contract_url", e.target.value)} placeholder="雲端硬碟連結" /></F>
        <F label="備註" full><Input value={form.note ?? ""} onChange={(e) => set("note", e.target.value)} /></F>
      </div>
      <DialogFooter><Button onClick={save}>儲存</Button></DialogFooter>
    </DialogContent>
  );
}
function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={cn("space-y-1", full && "sm:col-span-2")}><Label>{label}</Label>{children}</div>;
}
