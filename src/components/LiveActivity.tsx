import { Phone, MessageSquare, Reply, Calendar, Voicemail } from "lucide-react";

type ActivityItem = {
  id: string;
  type: "call" | "text" | "reply" | "followup" | "voicemail";
  label: string;
  time?: string;
};

type LiveActivityProps = {
  items?: ActivityItem[];
  isOnboardingComplete?: boolean;
  provisioningStatus?: string;
  forwardingVerified?: boolean;
};

const iconMap = {
  call: Phone,
  text: MessageSquare,
  reply: Reply,
  followup: Calendar,
  voicemail: Voicemail,
};

export default function LiveActivity({ 
  items = [], 
  isOnboardingComplete = false,
  provisioningStatus = 'pending',
  forwardingVerified = false 
}: LiveActivityProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
        <span className="text-xs text-slate-500">Live</span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">
          Activity will appear here as ReplyFlow handles missed calls.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const Icon = iconMap[item.type];

            return (
              <div key={item.id} className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-slate-800 p-2">
                  <Icon className="h-4 w-4 text-blue-400" />
                </div>

                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  {item.time && (
                    <p className="text-xs text-slate-500">{item.time}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}