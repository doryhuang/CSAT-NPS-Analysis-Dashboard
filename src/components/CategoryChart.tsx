import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LabelList } from 'recharts';
import { cn } from '../lib/utils';

interface ChartProps {
  data: Record<string, number>;
  title: string;
  type?: 'bar' | 'pie';
  onItemClick?: (name: string) => void;
  selectedItem?: string | null;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

export const CategoryChart: React.FC<ChartProps> = ({ data, title, type = 'bar', onItemClick, selectedItem }) => {
  const chartData = Object.entries(data)
    .map(([name, value]) => ({ name, value: Number(value) }))
    .sort((a, b) => b.value - a.value);

  if (chartData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-200 h-[350px] flex items-center justify-center">
        <p className="text-slate-400">尚無資料</p>
      </div>
    );
  }

  const handleClick = (data: any) => {
    if (onItemClick && data && data.name) {
      onItemClick(data.name);
    }
  };

  return (
    <div className={cn(
      "bg-white p-6 rounded-xl border transition-all",
      selectedItem ? "border-blue-200 shadow-md" : "border-slate-200 shadow-sm"
    )}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{title}</h3>
        {selectedItem && (
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
            已篩選: {selectedItem}
          </span>
        )}
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart 
              data={chartData} 
              layout="vertical" 
              margin={{ left: 40, right: 40 }}
              onClick={(e) => e && e.activeLabel && onItemClick && onItemClick(String(e.activeLabel))}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                width={120} 
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                style={{ cursor: 'pointer' }}
              />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar 
                dataKey="value" 
                radius={[0, 4, 4, 0]} 
                barSize={20}
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
              >
                <LabelList dataKey="value" position="right" style={{ fill: '#64748b', fontSize: '11px', fontWeight: 'bold' }} />
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={selectedItem ? (selectedItem === entry.name ? COLORS[index % COLORS.length] : '#e2e8f0') : COLORS[index % COLORS.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
              >
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={selectedItem ? (selectedItem === entry.name ? COLORS[index % COLORS.length] : '#e2e8f0') : COLORS[index % COLORS.length]} 
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
