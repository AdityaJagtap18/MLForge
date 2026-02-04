import os
import pandas as pd
import sys
import pickle

from config import Config
import argparse
import json

class Test:
	"""
		This is the test phase of the model we are implementing
		Arguments:
			:param arg1:test filename
			:param arg1:pickle filename
			:param arg2:input column number
			:param arg4:target column number
			:type arg1:str
			:type arg2:str
			:type arg3:int
			:type arg4:int
			:returns:output file with predicted data
			:rtype:.csv
		
	"""	

	def __init__(self,training_id,testing_id,csv_file_name,pickle_file_name,input_col,target_col):
		self.training_id = ''.join(map(str,training_id))
		self.testing_id = ''.join(map(str,testing_id))
		self.csv_file_name = ''.join(map(str,csv_file_name))
		self.pickle_file_name = ''.join(map(str,pickle_file_name))
		self.input_col = input_col
		self.target_col = target_col
		self.get_params()

	def get_params(self):
		try:
			df=pd.read_csv(self.csv_file_name)
			inputParams = [df.columns.get_loc(c) for c in self.input_col if c in df]
			targetParams = [df.columns.get_loc(c) for c in self.target_col if c in df]
			#print(inputParams[0],targetParams[0])
			df.fillna(0, inplace=True) 
			x_test=df.iloc[:,inputParams].values
			self.predict(df,x_test,targetParams)
		except FileNotFoundError as fne:
			print(fne)

	def predict(self,df,x_test,targetParams):

		pickleFile=pickle.load(open(self.pickle_file_name, 'rb'))
		y_pred=pickleFile.predict(x_test)
		#df = df[targetParams].str.split(n=10, expand=True)
		#colName=df.columns[targetParams]
		#df[targetParams[-1]]=y_pred
		#df[targetParams[0]] = y_pred
		df[self.target_col] = pd.DataFrame(y_pred)
		self.output(df)

	def output(self,df): 

		filename_w_ext = os.path.basename(self.csv_file_name)
		filename , ext = os.path.splitext(filename_w_ext)
		outputFileName = filename+'_output.csv'
		outputFileName = os.path.join(Config.TESTING_OUTPUT_FOLDER, outputFileName)
		try:
			df.to_csv(outputFileName,index = False)
			print("Succesful output file generation")
		#print('time taken : - ',time.time() - startTime)
		except Exception as e:
			print("Error: ", e.__str__())
		except IOError as ioe:
			print(ioe)
		except OSError as ose:
			print(ose)
		except FileNotFoundError as fne:
			print(fne)



if __name__ == "__main__":
	parser = argparse.ArgumentParser(description='')
	
	requiredNamed = parser.add_argument_group('required arguments')
	requiredNamed.add_argument('--training_id', type = str, nargs='+',
						help='training id')
	requiredNamed.add_argument('--testing_id', type = str, nargs='+',
						help='testing id')
	requiredNamed.add_argument('--csv_file_name', type= str, nargs='+',
						help='csv filename')
	requiredNamed.add_argument('--pickle_file_name',type= str, nargs='+',
						help='target column for train phase',required=True)
	requiredNamed.add_argument('--input_col',nargs='+',
						help='input columns for train phase')
	requiredNamed.add_argument('--target_col',nargs='+',
						help='target column for train phase')



	args = parser.parse_args()
	test = Test(args.training_id,args.testing_id,args.csv_file_name,args.pickle_file_name,args.input_col,args.target_col)



