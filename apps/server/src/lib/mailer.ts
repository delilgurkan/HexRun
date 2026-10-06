import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(m: Mail): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private t: ReturnType<typeof nodemailer.createTransport>;
  constructor(url: string, private from: string) {
    this.t = nodemailer.createTransport(url);
  }
  async send(m: Mail): Promise<void> {
    await this.t.sendMail({ from: this.from, to: m.to, subject: m.subject, text: m.text });
  }
}

/** Geliştirme/test: postayı belleğe yazar. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(m: Mail): Promise<void> {
    this.sent.push(m);
  }
}
