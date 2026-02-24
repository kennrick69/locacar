import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { carsAPI } from '../services/api';
import { Car, MapPin, Calendar, DollarSign, ArrowRight, Fuel } from 'lucide-react';

export default function Vitrine() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carsAPI.list()
      .then(res => setCars(res.data))
      .catch(err => console.error('Erro ao carregar carros:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-7 h-7 text-brand-600" />
            <span className="text-xl font-bold text-brand-800">LocaCar</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-600 hover:text-brand-600 font-medium">
              Entrar
            </Link>
            <Link to="/register" className="btn-primary text-sm py-2 px-4">
              Cadastre-se
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Alugue seu veículo de trabalho
          </h1>
          <p className="text-brand-200 text-lg max-w-2xl mx-auto">
            Carros prontos para rodar em apps de transporte. 
            Sem burocracia, sem fiador, pagamento semanal.
          </p>
          <Link to="/register" className="inline-flex items-center gap-2 bg-white text-brand-700 font-semibold px-6 py-3 rounded-lg mt-8 hover:bg-brand-50 transition-colors">
            Quero alugar <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Carros */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-gray-800">Carros Disponíveis</h2>
          <span className="text-sm text-gray-400">{cars.length} veículos</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : cars.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum carro disponível no momento</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cars.map(car => (
              <div key={car.id} className="card hover:shadow-md transition-shadow">
                {/* Foto */}
                <div className="aspect-video bg-gray-100 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  {car.foto_url ? (
                    <img src={car.foto_url} alt={`${car.marca} ${car.modelo}`} className="w-full h-full object-cover" />
                  ) : (
                    <Car className="w-12 h-12 text-gray-300" />
                  )}
                </div>

                {/* Info */}
                <h3 className="text-lg font-semibold text-gray-800">
                  {car.marca} {car.modelo}
                </h3>

                <div className="flex flex-wrap gap-3 mt-2 text-sm text-gray-500">
                  {car.ano && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {car.ano}
                    </span>
                  )}
                  {car.cor && (
                    <span className="flex items-center gap-1">
                      <Fuel className="w-3.5 h-3.5" /> {car.cor}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> {car.placa}
                  </span>
                </div>

                {/* Preço */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-end justify-between">
                  <div>
                    <span className="text-xs text-gray-400">Valor semanal</span>
                    <p className="text-xl font-bold text-brand-700">
                      R$ {parseFloat(car.valor_semanal).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                  <Link to="/register" className="text-sm text-brand-600 font-medium hover:text-brand-700 flex items-center gap-1">
                    Tenho interesse <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} LocaCar. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
