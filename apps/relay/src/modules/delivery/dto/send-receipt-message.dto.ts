import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { RelayReceiptMessageType, RelaySendReceiptMessageRequest } from '@bellfield/contracts';

const relayReceiptMessageTypes: readonly RelayReceiptMessageType[] = [
  'paymentReceipt',
  'refundReceipt'
];

export class SendReceiptMessageRequestDto implements RelaySendReceiptMessageRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  idempotencyKey!: string;

  @IsIn(relayReceiptMessageTypes)
  messageType!: RelayReceiptMessageType;

  @IsEmail()
  recipientEmail!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fromName!: string;

  @IsOptional()
  @IsEmail()
  replyToEmail?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  bodyText!: string;
}
