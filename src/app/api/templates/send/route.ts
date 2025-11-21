import { NextRequest, NextResponse } from 'next/server';
import {
    SESClient,
    SendTemplatedEmailCommand,
    SendTemplatedEmailCommandInput,
} from '@aws-sdk/client-ses';
import { AuthMiddleware } from '@/lib/auth-middleware';

// Initialize SES client
const sesClient = new SESClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

interface SendTemplatedEmailRequest {
    templateName: string;
    source: string;
    to: string[];
    templateData?: Record<string, unknown>;
    configurationSetName?: string;
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate the request
        const authResult = await AuthMiddleware.authenticate(request, {
            requireApiKey: false,
            requireSession: true,
            validateOrigin: false,
            validateAwsCredentials: true,
        });

        if (!authResult.success) {
            console.warn('Unauthorized send email attempt:', authResult.error);
            return authResult.response!;
        }

        const body: SendTemplatedEmailRequest = await request.json();
        const {
            templateName,
            source,
            to,
            templateData = {},
            configurationSetName,
        } = body;

        // Validate required fields
        if (!templateName || !source || !to || to.length === 0) {
            return NextResponse.json(
                {
                    error: 'Template name, source email, and recipient email(s) are required',
                },
                { status: 400 }
            );
        }

        // Validate email addresses
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(source)) {
            return NextResponse.json(
                { error: 'Invalid source email address' },
                { status: 400 }
            );
        }

        for (const email of to) {
            if (!emailRegex.test(email)) {
                return NextResponse.json(
                    { error: `Invalid recipient email address: ${email}` },
                    { status: 400 }
                );
            }
        }

        // Send templated email using SES
        const commandParams: SendTemplatedEmailCommandInput = {
            Source: source,
            Destination: {
                ToAddresses: to,
            },
            Template: templateName,
            TemplateData: JSON.stringify(templateData),
        };

        // Add configuration set if provided
        if (configurationSetName) {
            commandParams.ConfigurationSetName = configurationSetName;
        }

        const command = new SendTemplatedEmailCommand(commandParams);

        const result = await sesClient.send(command);

        return NextResponse.json({
            messageId: result.MessageId,
            success: true,
        });
    } catch (error) {
        console.error('Error sending templated email:', error);

        // Handle specific SES errors
        if (error instanceof Error) {
            if (error.name === 'TemplateDoesNotExist') {
                return NextResponse.json(
                    { error: 'Email template does not exist' },
                    { status: 404 }
                );
            }
            if (error.name === 'MessageRejected') {
                return NextResponse.json(
                    {
                        error: 'Email was rejected. Please check your SES sending limits and email addresses.',
                    },
                    { status: 400 }
                );
            }
        }

        return NextResponse.json(
            { error: 'Failed to send email' },
            { status: 500 }
        );
    }
}
