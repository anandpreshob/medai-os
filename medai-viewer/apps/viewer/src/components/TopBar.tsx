import React from 'react';
import { useTheme, Button } from '@medai/ui';
import { Sun, Moon, Settings, User, Activity } from 'lucide-react';
import { SuiteSelector } from './SuiteSelector';

export function TopBar() {
  const { mode, setMode } = useTheme();

  const toggleTheme = () => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="h-16 bg-background-secondary border-b border-border-subtle flex items-center justify-between px-6 relative z-[100] overflow-visible">
      {/* Subtle gradient glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-background-secondary via-background-tertiary/50 to-background-secondary pointer-events-none" />

      {/* Logo */}
      <div className="flex items-center gap-4 relative z-10">
        <div className="relative group">
          {/* Logo container with gradient and glow */}
          <div className="w-10 h-10 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-xl flex items-center justify-center shadow-md group-hover:shadow-glow transition-all duration-300">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          {/* Outer glow ring on hover */}
          <div className="absolute -inset-1 rounded-xl bg-accent-primary/20 opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-300" />
        </div>
        <div className="flex flex-col">
          <span className="text-text-primary font-bold text-lg tracking-tight leading-none">
            MedAI
          </span>
          <span className="text-accent-primary text-[10px] font-semibold uppercase tracking-[0.2em]">
            Viewer
          </span>
        </div>
      </div>

      {/* Navigation - refined pill styling */}
      <nav className="flex items-center bg-background-tertiary/50 rounded-xl p-1.5 border border-border-subtle relative z-10">
        {['File', 'View', 'Tools'].map((item) => (
          <Button
            key={item}
            variant="ghost"
            size="sm"
            className="rounded-lg px-5 py-1.5 text-text-secondary hover:text-text-primary hover:bg-background-hover/80 transition-all duration-200"
          >
            {item}
          </Button>
        ))}
      </nav>

      {/* Suite Selector */}
      <div className="flex items-center relative z-10">
        <SuiteSelector />
      </div>

      {/* Actions - better grouped with visual separation */}
      <div className="flex items-center gap-2 relative z-10">
        {/* Icon buttons group */}
        <div className="flex items-center gap-1 bg-background-tertiary/30 rounded-lg p-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            className="rounded-lg hover:bg-background-hover hover:text-accent-primary transition-all duration-200"
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {mode === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-lg hover:bg-background-hover hover:text-accent-primary transition-all duration-200"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gradient-to-b from-transparent via-border-emphasis to-transparent mx-1" />

        {/* User button */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="rounded-lg hover:bg-background-hover hover:text-accent-primary transition-all duration-200"
          title="User profile"
        >
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
