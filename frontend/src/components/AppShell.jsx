import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, ListOrdered, Send, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const link = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      isActive ? "bg-ochre text-white" : "text-stone-700 hover:bg-stone-100"
    }`;

  return (
    <div className="min-h-screen bg-cream">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white/70 backdrop-blur-xl border-r border-stone-200/60 p-5 hidden md:flex flex-col">
        <button onClick={() => nav("/dashboard")} className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-ochre flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold tracking-tight text-lg">CatatYuk<span className="text-ochre">.</span></span>
        </button>
        <nav className="space-y-1 flex-1">
          <NavLink data-testid="nav-dashboard-link" to="/dashboard" className={link}>
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </NavLink>
          <NavLink data-testid="nav-transactions-link" to="/transactions" className={link}>
            <ListOrdered className="w-4 h-4" /> Transaksi
          </NavLink>
          <NavLink data-testid="nav-telegram-link" to="/telegram" className={link}>
            <Send className="w-4 h-4" /> Telegram Bot
          </NavLink>
        </nav>
        <div className="border-t border-stone-200/60 pt-4">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="w-9 h-9">
              <AvatarImage src={user?.picture} />
              <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{user?.name}</div>
              <div className="text-xs text-stone-500 truncate">{user?.email}</div>
            </div>
          </div>
          <Button data-testid="logout-btn" onClick={logout} variant="outline" size="sm" className="w-full rounded-lg">
            <LogOut className="w-3.5 h-3.5 mr-1.5" /> Keluar
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-stone-200/60 px-4 h-14 flex items-center justify-between">
        <button onClick={() => nav("/dashboard")} className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-ochre flex items-center justify-center">
            <Wallet className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-extrabold">CatatYuk<span className="text-ochre">.</span></span>
        </button>
        <Avatar className="w-8 h-8">
          <AvatarImage src={user?.picture} />
          <AvatarFallback>{user?.name?.[0] || "U"}</AvatarFallback>
        </Avatar>
      </header>

      <main className="md:pl-64">
        <div className="max-w-6xl mx-auto p-5 md:p-8">
          <Outlet />
        </div>
        {/* mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200/70 px-2 py-2 flex justify-around z-30">
          <NavLink to="/dashboard" className={({isActive}) => `flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg ${isActive ? "text-ochre" : "text-stone-500"}`}>
            <LayoutDashboard className="w-5 h-5"/><span className="text-[10px] font-medium">Home</span>
          </NavLink>
          <NavLink to="/transactions" className={({isActive}) => `flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg ${isActive ? "text-ochre" : "text-stone-500"}`}>
            <ListOrdered className="w-5 h-5"/><span className="text-[10px] font-medium">Transaksi</span>
          </NavLink>
          <NavLink to="/telegram" className={({isActive}) => `flex flex-col items-center gap-0.5 py-1 px-3 rounded-lg ${isActive ? "text-ochre" : "text-stone-500"}`}>
            <Send className="w-5 h-5"/><span className="text-[10px] font-medium">Telegram</span>
          </NavLink>
          <button onClick={logout} className="flex flex-col items-center gap-0.5 py-1 px-3 text-stone-500">
            <LogOut className="w-5 h-5"/><span className="text-[10px] font-medium">Keluar</span>
          </button>
        </nav>
        <div className="md:hidden h-16"/>
      </main>
    </div>
  );
}
