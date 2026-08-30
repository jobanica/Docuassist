import { TagsSettings } from "@/components/admin/TagsSettings";
import { listTags } from "@/lib/actions/tags";

export const dynamic = "force-dynamic";

export default async function TagsSettingsPage() {
  const tags = await listTags();
  return <TagsSettings tags={tags} />;
}
