import { Wifi, Users, Activity, AlertTriangle } from "lucide-react";

const stats = [
  { label: "Clientes Ativos", value: "—", icon: Users, color: "text-primary" },
  { label: "Uptime da Rede", value: "—", icon: Activity, color: "text-accent" },
  { label: "Dispositivos Online", value: "—", icon: Wifi, color: "text-info" },
  { label: "Alertas", value: "—", icon: AlertTriangle, color: "text-warning" },
];

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Wifi className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            Dashboard ISP
          </h1>
        </div>
        <span className="text-xs text-muted-foreground font-mono">v1.0</span>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-lg border border-border bg-card p-5 flex items-center gap-4"
            >
              <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-bold font-mono text-foreground">
                  {stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        <div className="rounded-lg border border-dashed border-border bg-card/50 flex items-center justify-center h-64">
          <p className="text-muted-foreground text-sm">
            Configure seus módulos para começar
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
