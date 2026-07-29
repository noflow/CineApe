type EditorialStructuredDataProps = {
  kind: "review" | "list";
  name: string;
  description: string;
  path: string;
  publishedAt?: Date | null;
  image?: string | null;
};

const siteUrl = "https://cineape.com";

export function EditorialStructuredData({ kind, name, description, path, publishedAt, image }: EditorialStructuredDataProps) {
  const url = `${siteUrl}${path}`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: name,
    articleSection: kind === "review" ? "Reviews" : "Must watch",
    description,
    datePublished: publishedAt?.toISOString(),
    dateModified: publishedAt?.toISOString(),
    author: { "@type": "Organization", name: "CineApe" },
    publisher: { "@type": "Organization", name: "CineApe", url: siteUrl },
    ...(image ? { image } : {}),
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "CineApe", item: siteUrl },
      { "@type": "ListItem", position: 2, name: kind === "review" ? "Reviews" : "Must watch", item: `${siteUrl}/${kind === "review" ? "reviews" : "must-watch"}` },
      { "@type": "ListItem", position: 3, name, item: url },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([article, breadcrumbs]) }} />;
}
