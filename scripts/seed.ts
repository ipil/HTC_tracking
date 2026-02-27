import { sql } from "../lib/db";

async function seed() {
  await sql`
    insert into app_config (id)
    values (1)
    on conflict (id) do nothing
  `;

  for (let runner = 1; runner <= 12; runner += 1) {
    await sql`
      insert into runners (runner_number, name, default_estimated_pace_spm)
      values (${runner}, ${`Runner ${runner}`}, null)
      on conflict (runner_number) do update
      set name = excluded.name,
          updated_at = now()
      where runners.name is null or runners.name = ''
    `;
  }

  for (let leg = 1; leg <= 36; leg += 1) {
    const runner = ((leg - 1) % 12) + 1;
    await sql`
      insert into legs (
        leg,
        runner_number,
        leg_mileage,
        elev_gain_ft,
        elev_loss_ft,
        net_elev_diff_ft,
        exchange_label,
        exchange_url
      )
      values (
        ${leg},
        ${runner},
        5.00,
        0,
        0,
        0,
        ${`Exchange ${leg}`},
        ${"https://maps.google.com"}
      )
      on conflict (leg) do nothing
    `;

    await sql`
      insert into leg_inputs (leg)
      values (${leg})
      on conflict (leg) do nothing
    `;
  }

  console.log("Seed complete");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
