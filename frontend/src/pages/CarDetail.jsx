import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { carsAPI } from '../services/api';
import {
  Car, ArrowLeft, Calendar, Fuel, Gauge, Wind, Settings2,
  DoorOpen, ChevronLeft, ChevronRight, ArrowRight
} from 'lucide-react';

export default function CarDetail() {
  const { id } = useParams();
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photoIndex, setPhotoIndex] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    carsAPI.get(id)
      .then(res => setCar(res.data))
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );

  if (!car) return null;

  // Monta array de fotos
  let fotos = [];
  if (car.foto_url) fotos.push(car.foto_url);
  try {
    const extras = JSON.parse(car.fotos_extras || '[]');
    fotos = [...fotos, ...extras];
  } catch {}
  if (fotos.length === 0) fotos.push(null); // placeholder

  const specs = [
    { icon: Fuel, label: 'Combustível', value: car.combustivel || 'Flex' },
    { icon: Settings2, label: 'Transmissão', value: car.transmissao || 'Manual' },
    { icon: Gauge, label: 'Direção', value: car.direcao || 'Hidráulica' },
    { icon: Wind, label: 'Ar Condicionado', value: car.ar_condicionado ? 'Sim' : 'Não' },
    { icon: DoorOpen, label: 'Portas', value: car.portas || 4 },
    car.consumo_medio ? { icon: Fuel, label: 'Consumo', value: car.consumo_medio } : null,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-brand-600">
            <ArrowLeft className="w-5 h-5" /> <span className="text-sm font-medium">Voltar</span>
          </Link>
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-brand-600" />
            <span className="font-bold text-brand-800">LocaCar</span>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Galeria de fotos */}
        <div className="relative bg-gray-200 rounded-2xl overflow-hidden aspect-[16/9] mb-6">
          {fotos[photoIndex] ? (
            <img src={fotos[photoIndex]} alt={`${car.marca} ${car.modelo}`}
              className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Car className="w-20 h-20 text-gray-300" />
            </div>
          )}

          {fotos.length > 1 && (
            <>
              <button onClick={() => setPhotoIndex(i => (i - 1 + fotos.length) % fotos.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 text-white rounded-full flex items-center justify-center hover:bg-black/60">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setPhotoIndex(i => (i + 1) % fotos.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 text-white rounded-full flex items-center justify-center hover:bg-black/60">
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {fotos.map((_, i) => (
                  <button key={i} onClick={() => setPhotoIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full transition-all ${i === photoIndex ? 'bg-white scale-125' : 'bg-white/50'}`} />
                ))}
              </div>
            </>
          )}

          {/* Thumbs */}
          {fotos.length > 1 && (
            <div className="absolute bottom-14 left-3 right-3 flex gap-2 overflow-x-auto pb-1">
              {fotos.map((f, i) => (
                <button key={i} onClick={() => setPhotoIndex(i)}
                  className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    i === photoIndex ? 'border-white shadow-lg' : 'border-transparent opacity-70'
                  }`}>
                  {f ? <img src={f} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-gray-300" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{car.marca} {car.modelo}</h1>
              <div className="flex items-center gap-3 mt-1 text-gray-500">
                {car.ano && <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {car.ano}</span>}
                {car.cor && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{car.cor}</span>}
              </div>
            </div>

            {car.descricao && (
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <h3 className="font-semibold text-gray-700 mb-2">Sobre o veículo</h3>
                <p className="text-sm text-gray-600 whitespace-pre-line">{car.descricao}</p>
              </div>
            )}

            {/* Specs grid */}
            <div className="bg-white rounded-xl p-4 border border-gray-200">
              <h3 className="font-semibold text-gray-700 mb-3">Especificações</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {specs.map((spec, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                    <spec.icon className="w-4 h-4 text-brand-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-400">{spec.label}</p>
                      <p className="text-sm font-medium text-gray-700">{spec.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar - Preço + CTA */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-5 border border-gray-200 sticky top-20">
              <div className="mb-4">
                <p className="text-sm text-gray-400">Valor semanal</p>
                <p className="text-3xl font-bold text-brand-700">
                  R$ {parseFloat(car.valor_semanal).toFixed(2).replace('.', ',')}
                </p>
              </div>

              {car.valor_caucao > 0 && (
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="text-sm text-gray-400">Caução</p>
                  <p className="text-lg font-semibold text-gray-700">
                    R$ {parseFloat(car.valor_caucao).toFixed(2).replace('.', ',')}
                  </p>
                </div>
              )}

              <Link to={`/register?car=${car.id}`}
                className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-base">
                Tenho Interesse <ArrowRight className="w-5 h-5" />
              </Link>

              <p className="text-xs text-gray-400 text-center mt-3">
                Sem burocracia · Pagamento semanal
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
