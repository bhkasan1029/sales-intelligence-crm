import { getCustomerBook } from "@/lib/queries/rm";
import { requireRM } from "../placeholder";
import CustomersTable from "./customers-table";

export default async function CustomersPage() {
  const session = await requireRM();

  // The whole book comes down in one server render — an RM's is tens of rows —
  // so search, filtering and paging are instant and never round-trip.
  const initial = await getCustomerBook([session.user_id]);

  return <CustomersTable initial={initial} />;
}
