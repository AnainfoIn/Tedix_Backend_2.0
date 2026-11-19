# Replays db/schema.rb and later migrations with a fake DSL to get the current tables and columns.
require 'json'
$tables = {}
SCHEMA_VERSION = ARGV[1].to_i
class Tbl
  def initialize(name); @n = name; end
  def method_missing(type, *args, **opts)
    case type
    when :timestamps then col('created_at', 'datetime', null: false); col('updated_at', 'datetime', null: false)
    when :references, :belongs_to
      args.each { |a| col("#{a}_id", opts[:type] == :uuid ? 'uuid' : 'bigint', **opts); col("#{a}_type", 'string') if opts[:polymorphic] }
    when :remove then args.each { |a| $tables[@n]&.delete(a.to_s) }
    when :rename then h = $tables[@n]; h[args[1].to_s] = h.delete(args[0].to_s) if h&.key?(args[0].to_s)
    when :index, :check_constraint, :foreign_key, :remove_index, :remove_references, :change_default then nil
    when :column then col(args[0].to_s, args[1].to_s, **opts)
    else args.each { |a| col(a.to_s, type.to_s, **opts) }
    end
  end
  def col(n, t, **o); ($tables[@n] ||= {})[n] = { 'type' => t, 'null' => o.fetch(:null, true), 'default' => o[:default], 'array' => o[:array] ? true : false }; end
  def respond_to_missing?(*) = true
end
module DSL
  def create_table(name, **opts, &blk)
    name = name.to_s
    $tables[name] = {} if opts[:force] || !$tables[name]
    $tables[name]['id'] = { 'type' => (opts[:id] == :uuid ? 'uuid' : 'bigint'), 'null' => false, 'pk' => true } unless opts[:id] == false
    blk&.call(Tbl.new(name))
  end
  def change_table(name, **_o, &blk) = blk&.call(Tbl.new(name.to_s))
  def add_column(t, c, type, **o) = Tbl.new(t.to_s).col(c.to_s, type.to_s, **o)
  def remove_column(t, *cols, **_o) = cols.each { |c| $tables[t.to_s]&.delete(c.to_s) if c.is_a?(Symbol) || c.is_a?(String) }
  def remove_columns(t, *cols, **_o) = remove_column(t, *cols)
  def rename_column(t, a, b); h = $tables[t.to_s]; h[b.to_s] = h.delete(a.to_s) if h&.key?(a.to_s); end
  def change_column(t, c, type, **o); h = $tables[t.to_s]; h[c.to_s] = (h[c.to_s] || {}).merge('type' => type.to_s, 'null' => o.fetch(:null, h.dig(c.to_s, 'null')), 'default' => o.key?(:default) ? o[:default] : h.dig(c.to_s, 'default'), 'array' => o.key?(:array) ? o[:array] : h.dig(c.to_s, 'array')) if h; end
  def change_column_null(t, c, null, *_); h = $tables[t.to_s]; h[c.to_s]['null'] = null if h&.key?(c.to_s); end
  def change_column_default(t, c, d); h = $tables[t.to_s]; d = d[:to] if d.is_a?(Hash) && d.key?(:to); h[c.to_s]['default'] = d if h&.key?(c.to_s); end
  def add_reference(t, r, **o); Tbl.new(t.to_s).references(r, **o); end
  alias add_belongs_to add_reference
  def remove_reference(t, r, **o); $tables[t.to_s]&.delete("#{r}_id"); $tables[t.to_s]&.delete("#{r}_type") if o[:polymorphic]; end
  alias remove_belongs_to remove_reference
  def add_timestamps(t, **o) = Tbl.new(t.to_s).timestamps
  def drop_table(t, **_o) = $tables.delete(t.to_s)
  def rename_table(a, b) = ($tables[b.to_s] = $tables.delete(a.to_s))
  def create_join_table(a, b, **o, &blk); n = (o[:table_name] || [a, b].map(&:to_s).sort.join('_')).to_s; create_table(n, id: false) { |t| t.bigint "#{a.to_s.singularize rescue a.to_s.chomp('s')}_id"; t.bigint "#{b.to_s.chomp('s')}_id" }; blk&.call(Tbl.new(n)); end
  def table_exists?(t) = $tables.key?(t.to_s)
  def column_exists?(t, c, *_) = $tables[t.to_s]&.key?(c.to_s) || false
  def index_exists?(*) = false
  def foreign_key_exists?(*) = false
  def reversible; d = Object.new; def d.up; yield; end; def d.down; end; yield d; end
  def revert(*) = nil
  def up_only = yield
  def say_with_time(*) = yield
  def method_missing(*) = nil
  def respond_to_missing?(*) = true
end
class Object; def self.const_missing(n) = Class.new { def self.method_missing(*) = nil; def self.respond_to_missing?(*) = true; def self.[](*) = self }; end
module ActiveRecord
  class Schema; extend DSL; def self.define(**_o, &b) = instance_eval(&b); def self.[](*) = self; end
  class Migration; include DSL; extend DSL; def self.[](*) = self; def self.disable_ddl_transaction! = nil; end
end
load ARGV[0] + '/db/schema.rb'
Dir[ARGV[0] + '/db/migrate/*.rb'].sort.each do |f|
  next if File.basename(f).to_i <= SCHEMA_VERSION
  before = ObjectSpace.each_object(Class).select { |k| k < ActiveRecord::Migration }
  begin
    load f
    k = (ObjectSpace.each_object(Class).select { |c| c < ActiveRecord::Migration } - before).first
    next unless k
    m = k.new
    if k.method_defined?(:change, false) then m.change elsif k.method_defined?(:up, false) then m.up end
  rescue Exception => e
    warn "#{File.basename(f)}: #{e.class}: #{e.message[0, 120]}"
  end
end
puts JSON.pretty_generate($tables)
