"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { formatCurrency } from "@/lib/format";
import type { CanteenItem, CanteenOrder } from "@/lib/types";

const CATEGORIES = ["all", "BEVERAGE", "SNACK", "MEAL", "DESSERT", "OTHER"] as const;

export function StudentCanteen() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [cart, setCart] = useState<Record<string, number>>({});

  const params = [
    applied ? `q=${encodeURIComponent(applied)}` : "",
    category !== "all" ? `category=${category}` : "",
    "available=true",
  ].filter(Boolean).join("&");
  const items = useApi<{ items: CanteenItem[] }>(`/mess/canteen?${params}`);
  const orders = useApi<{ orders: CanteenOrder[] }>("/mess/orders");

  const reload = () => {
    items.reload();
    orders.reload();
  };

  function addToCart(id: string) {
    setCart((c) => ({ ...c, [id]: Math.min(50, (c[id] ?? 0) + 1) }));
  }

  function removeFromCart(id: string) {
    setCart((c) => {
      const next = { ...c };
      const qty = (next[id] ?? 0) - 1;
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <CartPanel cart={cart} items={items.data?.items ?? []} onChanged={reload} onClear={() => setCart({})} />

      <Card>
        <CardHeader>
          <CardTitle>Canteen menu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="border rounded px-2 py-1.5 text-sm flex-1 min-w-40"
              placeholder="Search items"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setApplied(query);
              }}
              aria-label="Search canteen items"
            />
            <select className="border rounded px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => setApplied(query)}>Search</Button>
          </div>

          {items.error ? (
            <ErrorState message={items.error} onRetry={items.reload} />
          ) : items.loading ? (
            <LoadingState label="Loading canteen..." />
          ) : (items.data?.items.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No items match your search.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {(items.data?.items ?? []).map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category} · {formatCurrency(item.price)}</p>
                    {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {(cart[item.id] ?? 0) > 0 && (
                      <>
                        <button className="rounded border px-2 py-0.5 text-sm" onClick={() => removeFromCart(item.id)} aria-label={`Remove one ${item.name}`}>−</button>
                        <span className="text-sm font-medium">{cart[item.id]}</span>
                      </>
                    )}
                    <button className="rounded border px-2 py-0.5 text-sm" onClick={() => addToCart(item.id)} aria-label={`Add one ${item.name}`}>+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My orders ({orders.data?.orders.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.loading ? (
            <LoadingState label="Loading orders..." />
          ) : (orders.data?.orders.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet. Add items to your cart above.</p>
          ) : (
            <ul className="space-y-2">
              {(orders.data?.orders ?? []).map((order) => (
                <OrderRow key={order.id} order={order} onChanged={reload} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CartPanel({
  cart,
  items,
  onChanged,
  onClear,
}: {
  cart: Record<string, number>;
  items: CanteenItem[];
  onChanged: () => void;
  onClear: () => void;
}) {
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = Object.entries(cart)
    .map(([itemId, quantity]) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return null;
      return { ...item, quantity, lineTotal: Math.round(item.price * quantity * 100) / 100 };
    })
    .filter(Boolean) as Array<CanteenItem & { quantity: number; lineTotal: number }>;
  const total = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;

  if (lines.length === 0) return null;

  async function placeOrder() {
    setPlacing(true);
    setError(null);
    try {
      await api("/mess/orders", {
        method: "POST",
        body: { items: lines.map((l) => ({ itemId: l.id, quantity: l.quantity })) },
      });
      onClear();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>Your cart ({lines.length} item(s))</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>{l.name} × {l.quantity}</span>
              <span>{formatCurrency(l.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t pt-2">
          <p className="font-medium">Total: {formatCurrency(total)}</p>
          <Button size="sm" onClick={placeOrder} disabled={placing}>
            {placing ? "Placing..." : "Place order"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <p className="text-xs text-muted-foreground">Prices are locked at order time. Completed orders bill to your fee ledger monthly.</p>
      </CardContent>
    </Card>
  );
}

function OrderRow({ order, onChanged }: { order: CanteenOrder; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api(`/mess/orders/${order.id}/cancel`, { method: "POST" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const cancellable = order.status === "PENDING" || order.status === "CONFIRMED";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{formatCurrency(order.totalAmount)} · {order.orderedAt.slice(0, 16).replace("T", " ")}</p>
          <p className="text-xs text-muted-foreground">
            {order.items.map((i) => `${i.itemName} × ${i.quantity}`).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{order.status}</Badge>
          {cancellable && (
            <button className="text-xs text-red-600 hover:underline disabled:opacity-50" disabled={busy} onClick={cancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
