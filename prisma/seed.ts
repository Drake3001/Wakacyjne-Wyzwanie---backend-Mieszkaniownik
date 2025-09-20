import { PrismaClient, Role, NotificationMethod } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  await prisma.user.deleteMany();
  await prisma.alert.deleteMany();

  const password = await hash('haslo', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'jan.kowalski@imejl.pl',
      name: 'Jan',
      surname: 'Kowalski',
      password: password,
      role: Role.ADMIN,
      isEnabled: true,
      active: true,
    },
  });

    const regularUser1 = await prisma.user.create({
    data: {
      email: 'anna.kowalska@imejl.pl',
      name: 'Anna',
      surname: 'Kowalska', 
      password: password,
      role: Role.USER,
      isEnabled: true,
      active: true,
    },
  });

  const regularUser2 = await prisma.user.create({
    data: {
      email: 'panpawel@imejl.pl',
      name: 'Paweł',
      surname: 'Nowak',
      password: password,
      role: Role.USER,
      isEnabled: true,
      active: true,
    },
  });

  const alert1 = await prisma.alert.create({
    data: {
      userId: regularUser1.id,
      name: 'Mieszkanie w Krakowie',
      city: 'Kraków',
      minPrice: 2000,
      maxPrice: 4000,
      minFootage: 30,
      maxFootage: 70,
      notificationMethod: NotificationMethod.EMAIL,
    },
  });

  const alert2 = await prisma.alert.create({
    data: {
      userId: regularUser2.id,
      name: 'Kawalerka w Warszawie',
      city: 'Warszawa',
      minPrice: 1500,
      maxPrice: 3500,
      rooms: 1,
      notificationMethod: NotificationMethod.DISCORD,
    },
  });

  const alert3 = await prisma.alert.create({
    data: {
      userId: adminUser.id,
      name: 'Tanie mieszkanie w Poznaniu',
      city: 'Poznań',
      minPrice: 1000,
      maxPrice: 2500,
      furniture: false,
      notificationMethod: NotificationMethod.BOTH,
    },
  });

  const alert4 = await prisma.alert.create({
    data: {
      userId: regularUser1.id,
      name: 'Mieszkanie z windą w Gdańsku',
      city: 'Gdańsk',
      minPrice: 2000,
      maxPrice: 6000,
      elevator: true,
      notificationMethod: NotificationMethod.EMAIL,
    },
  });

  const alert5 = await prisma.alert.create({
    data: {
      userId: regularUser2.id,
      name: 'Umeblowane mieszkanie w małym mieście',
      city: 'Tychy',
      minPrice: 1200,
      maxPrice: 2000,
      furniture: true,
      notificationMethod: NotificationMethod.BOTH,
    },
  });

  const alert6 = await prisma.alert.create({
    data: {
      userId: adminUser.id,
      name: 'Mieszkanie dla studenta - Lublin',
      city: 'Lublin',
      minPrice: 1500,
      maxPrice: 2500,
      rooms: 1,
      notificationMethod: NotificationMethod.EMAIL,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error('Error seeding database:', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
