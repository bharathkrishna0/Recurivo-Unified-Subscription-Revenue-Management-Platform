import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "./states";
import { ButtonLink } from "@/components/primitives/button";

/** Placeholder for workspace sections delivered in a later milestone. */
export function UpcomingSection({ title, description, root = "/app" }: { title: string; description: string; root?: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        title="This section is not available yet."
        body="It is part of an upcoming release of this workspace. Existing records are not affected."
        action={
          <ButtonLink href={root} variant="secondary">
            Back to overview
          </ButtonLink>
        }
      />
    </>
  );
}
