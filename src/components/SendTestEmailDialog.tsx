
import React, { useState, useEffect, useMemo } from 'react';
import { SendHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { sendTemplatedEmail } from '@/lib/aws-ses';

interface SendTestEmailDialogProps {
  isOpen: boolean;
  onClose: () => void;
  templateName: string;
  htmlPart?: string;
  textPart?: string;
}

// Function to extract placeholders from template
const extractPlaceholders = (html: string, text: string): string[] => {
  const placeholders = new Set<string>();
  const regex = /\{\{(\w+)\}\}/g;
  
  let match;
  while ((match = regex.exec(html)) !== null) {
    placeholders.add(match[1]);
  }
  while ((match = regex.exec(text)) !== null) {
    placeholders.add(match[1]);
  }
  
  return Array.from(placeholders);
};

const SendTestEmailDialog: React.FC<SendTestEmailDialogProps> = ({
  isOpen,
  onClose,
  templateName,
  htmlPart = '',
  textPart = ''
}) => {
  const [fromEmail, setFromEmail] = useState<string>('');
  const [toEmails, setToEmails] = useState<string>('');
  const [configurationSetName, setConfigurationSetName] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [templateData, setTemplateData] = useState<Record<string, string>>({});

  // Extract placeholders from template
  const placeholders = useMemo(() => {
    return extractPlaceholders(htmlPart, textPart);
  }, [htmlPart, textPart]);

  // Initialize template data when placeholders change
  useEffect(() => {
    const initialData: Record<string, string> = {};
    placeholders.forEach(placeholder => {
      initialData[placeholder] = '';
    });
    setTemplateData(initialData);
  }, [placeholders]);

  const handlePlaceholderChange = (key: string, value: string) => {
    setTemplateData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSend = async () => {
    if (!fromEmail.trim()) {
      toast.error("Please enter a sender email address");
      return;
    }
    
    if (!toEmails.trim()) {
      toast.error("Please enter at least one recipient email address");
      return;
    }
    
    // Check if email format is valid (simple validation)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromEmail)) {
      toast.error("Please enter a valid sender email address");
      return;
    }
    
    const recipients = toEmails.split(',').map(email => email.trim());
    const invalidEmails = recipients.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email format: ${invalidEmails.join(', ')}`);
      return;
    }

    setIsSending(true);
    
    try {
      const messageId = await sendTemplatedEmail(
        templateName,
        fromEmail,
        recipients,
        templateData,
        configurationSetName || undefined
      );
      
      toast.success(`Email sent successfully! Message ID: ${messageId}`);
      onClose();
    } catch (error: unknown) {
      console.error('Failed to send email:', error);
      
      // Handle specific AWS SES errors
      if (error && typeof error === 'object' && 'name' in error) {
        if (error.name === 'MessageRejected') {
          toast.error("Email rejected: Your account may be in sandbox mode. Verify your sending limits and that recipient emails are verified.");
        } else {
          const errorMessage = 'message' in error ? String(error.message) : 'Unknown error';
          toast.error(`Failed to send email: ${errorMessage}`);
        }
      } else {
        toast.error('Failed to send email: Unknown error');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>
            Send a test email using the template "{templateName}".
            {' '}
            <span className="text-amber-500">
              Note: In SES sandbox mode, both sender and recipient emails must be verified.
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="fromEmail">From (Sender Email)</Label>
            <Input
              id="fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="sender@example.com"
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="toEmails">
              To (Recipient Emails, comma separated)
            </Label>
            <Input
              id="toEmails"
              value={toEmails}
              onChange={(e) => setToEmails(e.target.value)}
              placeholder="recipient1@example.com, recipient2@example.com"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="configurationSet">
              Configuration Set (Optional)
            </Label>
            <Input
              id="configurationSet"
              value={configurationSetName}
              onChange={(e) => setConfigurationSetName(e.target.value)}
              placeholder="my-configuration-set"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty if you don't use configuration sets for tracking.
            </p>
          </div>

          {placeholders.length > 0 && (
            <>
              <div className="border-t pt-4 mt-2">
                <Label className="text-base">Template Variables</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Fill in values for the placeholders found in your template.
                </p>
              </div>

              {placeholders.map((placeholder) => (
                <div key={placeholder} className="grid gap-2">
                  <Label htmlFor={`placeholder-${placeholder}`}>
                    {placeholder}
                  </Label>
                  <Input
                    id={`placeholder-${placeholder}`}
                    value={templateData[placeholder] || ''}
                    onChange={(e) => handlePlaceholderChange(placeholder, e.target.value)}
                    placeholder={`Enter value for {{${placeholder}}}`}
                  />
                </div>
              ))}
            </>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              "Sending..."
            ) : (
              <>
                <SendHorizontal className="w-4 h-4 mr-2" />
                Send Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendTestEmailDialog;
