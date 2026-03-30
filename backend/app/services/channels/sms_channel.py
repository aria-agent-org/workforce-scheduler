"""SMS notification channel via AWS SNS."""

import logging
import re

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.config import get_settings

logger = logging.getLogger(__name__)

# E.164 phone number pattern: + followed by 1-15 digits
E164_PATTERN = re.compile(r"^\+[1-9]\d{1,14}$")


def _validate_e164(phone_number: str) -> bool:
    """Validate phone number is in E.164 format."""
    return bool(E164_PATTERN.match(phone_number))


async def send_sms(phone_number: str, message: str) -> bool:
    """
    Send an SMS message via AWS SNS.

    Args:
        phone_number: Recipient phone in E.164 format (e.g. +972521234567).
        message: SMS message text.

    Returns:
        True if sent successfully, False otherwise.
    """
    if not _validate_e164(phone_number):
        logger.error(f"Invalid E.164 phone number: {phone_number}")
        return False

    settings = get_settings()

    try:
        sns_client = boto3.client(
            "sns",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
        )

        response = sns_client.publish(
            PhoneNumber=phone_number,
            Message=message,
            MessageAttributes={
                "AWS.SNS.SMS.SMSType": {
                    "DataType": "String",
                    "StringValue": "Transactional",
                },
            },
        )

        message_id = response.get("MessageId", "unknown")
        logger.info(f"SMS sent to {phone_number} — message_id: {message_id}")
        return True

    except (BotoCoreError, ClientError) as exc:
        logger.error(f"AWS SNS error sending to {phone_number}: {exc}")
        return False
    except Exception as exc:
        logger.error(f"Unexpected error sending SMS to {phone_number}: {exc}")
        return False
