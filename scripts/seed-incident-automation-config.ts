import { prisma } from "../src/lib/db";

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  for (const o of orgs) {
    const res = await prisma.orgIncidentAutomationConfig.upsert({
      where: { orgId: o.id },
      create: { orgId: o.id },
      update: {},
    });
    if (res) created++;
  }
  console.log(`Ensured config row for ${created} orgs`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
