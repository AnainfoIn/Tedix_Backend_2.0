require 'json'
T = { 'string'=>'character varying','text'=>'text','integer'=>'integer','bigint'=>'bigint','boolean'=>'boolean','datetime'=>'timestamp(6) without time zone','timestamp'=>'timestamp without time zone','date'=>'date','decimal'=>'numeric','float'=>'double precision','json'=>'json','jsonb'=>'jsonb','uuid'=>'uuid','time'=>'time without time zone','binary'=>'bytea','citext'=>'text','inet'=>'inet','hstore'=>'jsonb','numeric'=>'numeric','bigserial'=>'bigint','serial'=>'integer','interval'=>'interval','tsvector'=>'tsvector','enum'=>'character varying','virtual'=>'text'}
q = ->(v){ case v when nil then nil when true,false then v.to_s when Numeric then v.to_s when Array then "'{#{v.join(',')}}'" when Hash then "'#{v.to_json}'" else "'#{v.to_s.gsub("'", "''")}'" end }
out = ["SET client_min_messages = warning;"]
JSON.parse(File.read(ARGV[0])).each do |name, cols|
  defs = cols.map do |c, o|
    if o['pk'] then next %("#{c}" #{o['type']=='uuid' ? 'uuid PRIMARY KEY DEFAULT gen_random_uuid()' : 'bigserial PRIMARY KEY'})
    end
    ty = T.fetch(o['type']) { warn "type #{o['type']} #{name}.#{c}"; 'text' }
    ty += '[]' if o['array']
    d = o['default'].is_a?(Proc) ? nil : q.(o['default'])
    d = nil if o['default'].is_a?(String) && o['default'].start_with?('->')
    %("#{c}" #{ty}#{o['null']==false ? ' NOT NULL' : ''}#{d ? " DEFAULT #{d}" : ''})
  end
  out << %(DROP TABLE IF EXISTS "#{name}" CASCADE;\nCREATE TABLE "#{name}" (\n  #{defs.join(",\n  ")}\n);)
end
puts out
