import { Package, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { db } from "@/lib/data/client";
import { listProducts } from "@/lib/data/repository";
import { todayIso } from "@/lib/policy/deadline";
import { currentUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function ProductsPage() {
  const userId = await currentUserId();
  const products = await listProducts(db(), userId, { includePolicies: true });
  const today = todayIso();

  return (
    <>
      <PageHeader
        eyebrow="Archive"
        title="Products"
        description="Everything you have confirmed. Unverified policies stay flagged here until you review them."
        actions={
          <Link href="/products/new">
            <Button size="sm">
              <Plus aria-hidden />
              Add manually
            </Button>
          </Link>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={<Package />}
          title="Nothing tracked yet"
          description="Upload an invoice or add a product by hand. Nothing is saved until you review and confirm the details."
          action={
            <Link href="/upload">
              <Button size="sm">Upload an invoice</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} todayIso={today} />
          ))}
        </div>
      )}
    </>
  );
}
