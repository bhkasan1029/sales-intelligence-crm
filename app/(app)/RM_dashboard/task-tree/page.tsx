import { Placeholder, requireRM } from "../placeholder";

export default async function TaskTreePage() {
  await requireRM();

  return (
    <Placeholder
      icon="account_tree"
      title="Task Tree"
      description="Your open actions grouped into tasks, weighted by priority."
      sections={["Task groups", "Linked actions", "Priority graph"]}
    />
  );
}
