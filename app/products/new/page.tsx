import { ManualProductForm } from "@/components/manual-product-form";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Add a product" };

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        eyebrow="Manual entry"
        title="Add a product"
        description="The offline path. No invoice, no model, no upload — just what you know for certain. This is also the fallback when the AI extractor is unavailable."
      />
      <ManualProductForm />
    </>
  );
}
