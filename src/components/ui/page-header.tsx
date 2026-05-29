import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  actions?: ReactNode;
  showBackButton?: boolean;
  onBack?: () => void;
  children?: ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  iconClassName,
  actions,
  showBackButton,
  onBack,
  children,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {showBackButton && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="shrink-0 h-8 w-8 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        )}
        {Icon && (
          <div className={`shrink-0 p-1.5 sm:p-2 rounded-lg ${iconClassName || 'bg-primary/10'}`}>
            <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      
      {(actions || children) && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {actions}
          {children}
        </div>
      )}
    </div>
  );
}
