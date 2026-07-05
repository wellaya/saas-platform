import { getServerSession } from "next-auth";

export default async function DashboardPage({
    params
}: { params: { tenantSlug: string } }) {
    const session = await getServerSession();

    return (
        <div className="p-8">
            <h1 className="text-2xl font-medium mb-2">
                Dashboard — {params.tenantSlug}
            </h1>
            <p className="text-gray-500">Logged in as {session?.user?.email}</p>
        </div>
    );
}