import 'reflect-metadata';
import { hash } from 'argon2';
import { Db } from './db';
import './config';
async function run() {
 const email=process.env.OWNER_EMAIL?.trim().toLowerCase(), password=process.env.OWNER_PASSWORD;
 if(!email || !password || password.length<12) throw new Error('Set OWNER_EMAIL and OWNER_PASSWORD (12+ characters)');
 const db=new Db(); await db.$connect();
 try {
  if(await db.userRole.count({where:{role:'OWNER'}})) throw new Error('Owner already exists. Use account recovery.');
  await db.user.create({data:{email,passwordHash:await hash(password),name:process.env.OWNER_NAME??'Руководитель клуба',emailVerifiedAt:new Date(),roles:{create:{role:'OWNER'}}}});
  process.stdout.write('Owner created\n');
 } finally {await db.$disconnect();}
}
void run();
