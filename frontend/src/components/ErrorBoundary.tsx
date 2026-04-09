import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] CRASH:", error?.message ?? error);
    console.error("[ErrorBoundary] Stack:", error?.stack);
    console.error("[ErrorBoundary] Component:", info.componentStack);
  }

  private isChunkLoadError(error: Error | null) {
    if (!error) return false;
    const message = error.message ?? "";
    return /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
  }

  handleRetry = () => {
    if (this.isChunkLoadError(this.state.error)) {
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isChunk = this.isChunkLoadError(this.state.error);

      return (
        <div className="mx-auto max-w-md py-16 px-4 text-center">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 mb-3">
            <WifiOff className="h-5 w-5 text-amber-400" />
          </div>
          <p className="text-sm font-semibold text-foreground/80 mb-1">
            {isChunk ? "Atualização detectada" : "Algo não carregou corretamente"}
          </p>
          <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-sm mx-auto mb-4">
            {isChunk
              ? "Uma nova versão está disponível. Recarregue a página para continuar."
              : "Parece que encontramos um problema neste módulo. Tente recarregar a página ou sair e entrar novamente. Se persistir, entre em contato com a equipe de desenvolvimento."}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/15 bg-card/50 px-4 py-2 text-xs font-medium text-foreground/70 transition hover:bg-card/80 hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isChunk ? "Recarregar" : "Tentar novamente"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
