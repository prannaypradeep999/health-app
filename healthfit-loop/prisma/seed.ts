import { PrismaClient } from '@prisma/client';
import { EXERCISE_LIBRARY } from '../src/lib/data/exercise-library';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding exercise library...');
  for (const exercise of EXERCISE_LIBRARY) {
    await prisma.exerciseLibrary.upsert({
      where: { name: exercise.name },
      update: exercise,
      create: exercise,
    });
  }
  console.log(`Seeded ${EXERCISE_LIBRARY.length} exercises.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
