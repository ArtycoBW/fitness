import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { Db } from '../../db';
import { env } from '../../config';
import { unseal } from '../../common/crypto';
interface MailPayload { to:string; subject:string; text:string; }
@Injectable()
export class OutboxService {
 private readonly logger=new Logger('Outbox');
 private readonly transport=nodemailer.createTransport({host:env.SMTP_HOST,port:env.SMTP_PORT,secure:false,connectionTimeout:5000,socketTimeout:10000});
 constructor(private readonly db:Db) {}
 async tick() {
  const events=await this.db.$queryRaw<Array<{id:string,type:string,payload:string,attempts:number,dedupKey:string}>>`
   UPDATE "OutboxEvent" SET "status"='PROCESSING', "lockedAt"=NOW(), "attempts"="attempts"+1
   WHERE "id" IN (SELECT "id" FROM "OutboxEvent" WHERE ("status"='PENDING' AND "availableAt"<=NOW()) OR ("status"='PROCESSING' AND "lockedAt"<NOW()-INTERVAL '2 minutes') ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 10)
   RETURNING "id","type","payload","attempts","dedupKey"`;
  for(const event of events) {
   try {
    if(event.type==='EMAIL') { const mail=unseal<MailPayload>(event.payload); await this.transport.sendMail({...mail,from:env.SMTP_FROM,messageId:'<'+event.id+'@fitness.local>'}); }
    else throw new Error('Unsupported outbox event');
    await this.db.outboxEvent.update({where:{id:event.id},data:{status:'SENT',payload:'',lockedAt:null,lastError:null}});
   } catch {
    const seconds=[5,30,120,600,3600][Math.min(event.attempts-1,4)]??3600;
    await this.db.outboxEvent.update({where:{id:event.id},data:{status:event.attempts>=6?'DEAD':'PENDING',lockedAt:null,availableAt:new Date(Date.now()+seconds*1000),lastError:'Delivery failed'}});
    this.logger.warn(JSON.stringify({eventId:event.id,attempt:event.attempts,status:'delivery_failed'}));
   }
  }
  await this.db.rateBucket.deleteMany({where:{window:{lt:new Date(Date.now()-86400000)}}});
 }
}
